import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';

type StaffFlag = 'IsInScrum' | 'IsDriver' | 'HasCostInvoiceAccess' | 'HasBankAccess';

export default class StaffMemberRepository {
    /**
     * Tworzy rekord StaffMembers z domyślnymi flagami dla roli, jeśli jeszcze nie
     * istnieje (INSERT IGNORE - nie nadpisuje ręcznie zmienionych flag). Domyślne
     * flagi spójne z seedem migracji: wszyscy = kierowcy; rola 3 = scrum;
     * role 1,2 = faktury kosztowe + bank.
     */
    static async ensureDefaultsForRole(
        personId: number,
        role: number,
        conn?: mysql.PoolConnection
    ): Promise<void> {
        const isInScrum = role === 3 ? 1 : 0;
        const hasElevated = role === 1 || role === 2 ? 1 : 0;
        const sql = `INSERT IGNORE INTO StaffMembers
            (PersonId, IsDriver, IsInScrum, HasCostInvoiceAccess, HasBankAccess)
            VALUES (?, 1, ?, ?, ?)`;
        await ToolsDb.getQueryCallbackAsync(sql, conn, [
            personId,
            isInScrum,
            hasElevated,
            hasElevated,
        ]);
    }

    /** Id osób z ustawioną flagą (i aktywnych). */
    private static async getPersonIdsByFlag(flag: StaffFlag): Promise<number[]> {
        // flag pochodzi z zamkniętego union typu (nie z inputu) - bezpieczne w SQL.
        const sql = `SELECT PersonId FROM StaffMembers WHERE ${flag} = 1 AND IsActive = 1`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return rows.map((r) => r.PersonId);
    }

    static getScrumPersonIds(): Promise<number[]> {
        return this.getPersonIdsByFlag('IsInScrum');
    }

    static getDriverPersonIds(): Promise<number[]> {
        return this.getPersonIdsByFlag('IsDriver');
    }
}
