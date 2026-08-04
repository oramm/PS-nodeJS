import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';

export type AssignedProject = {
    ourId: string;
    name: string;
};

/**
 * Przypisania osoby do projektów (tabela PersonProjects) - źródło zakresu danych
 * dla roli CONTRACT_WORKER. Klasa statyczna jak StaffMemberRepository: tabela jest
 * czystym powiązaniem, bez modelu biznesowego i bez własnego CRUD-a w UI.
 */
export default class ProjectAssignmentRepository {
    /** OurId projektów przypisanych osobie - podstawa filtra zakresu w repozytoriach. */
    static async getAssignedProjectOurIds(personId: number): Promise<string[]> {
        const sql = `SELECT ProjectOurId FROM PersonProjects WHERE PersonId = ?`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            personId,
        ])) as any[];
        return rows.map((r) => r.ProjectOurId);
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
     * tak wygląda zmiana roli na inną niż CONTRACT_WORKER.
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
