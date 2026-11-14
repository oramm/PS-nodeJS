import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import { dataScopeProjectOurIds, MembershipEdge } from './projectMembership';

export type AssignedProject = {
    ourId: string;
    name: string;
};

/**
 * Przypisania osoby do projektów (tabela PersonProjects) - źródło zakresu danych
 * dla ról zakresowych (CONTRACT_WORKER, CLIENT). Klasa statyczna jak StaffMemberRepository: tabela jest
 * czystym powiązaniem, bez modelu biznesowego i bez własnego CRUD-a w UI.
 */
export default class ProjectAssignmentRepository {
    /** OurId projektów przypisanych osobie wprost (tylko PersonProjects - formularz i dziennik zmian). */
    static async getAssignedProjectOurIds(personId: number): Promise<string[]> {
        const sql = `SELECT ProjectOurId FROM PersonProjects WHERE PersonId = ?`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            personId,
        ])) as any[];
        return rows.map((r) => r.ProjectOurId);
    }

    /**
     * Przypisania wszystkimi drogami reguły projectMembership (kierownik, administrator, osoba
     * dodatkowa kontraktu, PersonProjects). Filtr opcjonalny; pusta lista projektów = nic.
     */
    static async findMembership(filter: { projectOurIds?: string[]; personId?: number } = {}): Promise<MembershipEdge[]> {
        if (filter.projectOurIds && !filter.projectOurIds.length) return [];
        const where = (projectColumn: string, personColumn: string) => [
            filter.projectOurIds ? `${projectColumn} IN (?)` : '',
            filter.personId !== undefined ? `${personColumn} = ?` : '',
        ].filter(Boolean).join(' AND ');
        const params = [filter.projectOurIds, filter.personId].filter((value) => value !== undefined);
        const contractWhere = where('c.ProjectOurId', 'a.PersonId');
        const projectWhere = where('ProjectOurId', 'PersonId');
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT c.ProjectOurId AS projectOurId, c.Id AS contractId, a.PersonId AS personId
            FROM (SELECT Id AS ContractId, ManagerId AS PersonId FROM OurContractsData WHERE ManagerId > 0
                UNION SELECT Id, AdminId FROM OurContractsData WHERE AdminId > 0
                UNION SELECT ContractId, PersonId FROM ContractSelectedPersons) a
            JOIN Contracts c ON c.Id = a.ContractId${contractWhere ? ` WHERE ${contractWhere}` : ''}
            UNION
            SELECT ProjectOurId, NULL, PersonId FROM PersonProjects${projectWhere ? ` WHERE ${projectWhere}` : ''}`,
            undefined,
            [...params, ...params],
        )) as any[];
        return rows.map((r) => ({
            projectOurId: r.projectOurId,
            contractId: r.contractId ?? null,
            personId: Number(r.personId),
        }));
    }

    /** Zakres danych roli ograniczonej według reguły projectMembership (tylko przypisanie do projektu). */
    static async getDataScopeProjectOurIds(personId: number): Promise<string[]> {
        return dataScopeProjectOurIds(await this.findMembership({ personId }), personId);
    }

    /** Projekty z nazwami - do wyświetlenia w formularzu użytkownika. */
    static async getAssignedProjects(
        personId: number
    ): Promise<AssignedProject[]> {
        const sql = `SELECT pp.ProjectOurId AS ourId, p.Name AS name
            FROM PersonProjects pp
            JOIN Projects p ON p.OurId = pp.ProjectOurId
            WHERE pp.PersonId = ?
            ORDER BY pp.ProjectOurId`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            personId,
        ])) as any[];
        return rows.map((r) => ({ ourId: r.ourId, name: r.name }));
    }

    static async hasAnyAssignment(personId: number): Promise<boolean> {
        const sql = `SELECT 1 FROM PersonProjects WHERE PersonId = ? LIMIT 1`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            personId,
        ])) as any[];
        return rows.length > 0;
    }

    /** Które z podanych OurId faktycznie istnieją - walidacja przed zapisem. */
    static async filterExistingProjectOurIds(
        projectOurIds: string[]
    ): Promise<string[]> {
        if (projectOurIds.length === 0) return [];
        const sql = `SELECT OurId FROM Projects WHERE OurId IN (?)`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            projectOurIds,
        ])) as any[];
        return rows.map((r) => r.OurId);
    }

    /**
     * Ustawia komplet przypisań osoby (replace-all). Pusta lista czyści przypisania -
     * tak wygląda zmiana roli na inną niż zakresowa.
     */
    static async setAssignments(
        personId: number,
        projectOurIds: string[],
        externalConn?: mysql.PoolConnection
    ): Promise<void> {
        await ToolsDb.transaction(async (conn) => {
            await ToolsDb.getQueryCallbackAsync(
                `DELETE FROM PersonProjects WHERE PersonId = ?`,
                conn,
                [personId]
            );
            if (projectOurIds.length === 0) return;
            const values = projectOurIds.map((ourId) => [personId, ourId]);
            await ToolsDb.getQueryCallbackAsync(
                `INSERT INTO PersonProjects (PersonId, ProjectOurId) VALUES ?`,
                conn,
                [values]
            );
        }, externalConn);
    }
}
