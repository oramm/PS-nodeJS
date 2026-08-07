import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';

type StaffFlag =
    | 'IsInScrum'
    | 'IsDriver'
    | 'HasCostInvoiceAccess'
    | 'HasBankAccess'
    | 'CanLogSiteVisits';

export default class StaffMemberRepository {
    /**
     * Tworzy rekord StaffMembers z domyślnymi flagami dla roli, jeśli jeszcze nie
     * istnieje (INSERT IGNORE - nie nadpisuje ręcznie zmienionych flag). Domyślne
     * flagi spójne z seedem migracji: pracownicy ENVI = kierowcy; rola 3 = scrum;
     * role 1,2 = faktury kosztowe + bank.
     *
     * Role zewnętrzne 6 (CONTRACT_WORKER) i 7 (CLIENT) dostają wszystkie flagi na 0:
     * to osoby spoza ENVI, więc kilometrówkę i rejestrowanie wizyt na budowie włącza
     * się im pojedynczo, świadomą decyzją. Klient i tak widzi raporty z wizyt bez tej
     * flagi - ona rozstrzyga tylko o rejestrowaniu własnych (SiteVisitRouters).
     */
    static async ensureDefaultsForRole(
        personId: number,
        role: number,
        conn?: mysql.PoolConnection
    ): Promise<void> {
        const isProjectScopedRole = role === 6 || role === 7;
        const isDriver = isProjectScopedRole ? 0 : 1;
        const isInScrum = role === 3 ? 1 : 0;
        const hasElevated = role === 1 || role === 2 ? 1 : 0;
        const sql = `INSERT IGNORE INTO StaffMembers
            (PersonId, IsDriver, IsInScrum, HasCostInvoiceAccess, HasBankAccess)
            VALUES (?, ?, ?, ?, ?)`;
        await ToolsDb.getQueryCallbackAsync(sql, conn, [
            personId,
            isDriver,
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

    static getSiteVisitorPersonIds(): Promise<number[]> {
        return this.getPersonIdsByFlag('CanLogSiteVisits');
    }

    /** Czy dana osoba ma ustawioną flagę (i jest aktywna). */
    private static async hasFlag(
        personId: number,
        flag: StaffFlag
    ): Promise<boolean> {
        // flag pochodzi z zamkniętego union typu (nie z inputu) - bezpieczne w SQL.
        const sql = `SELECT 1 FROM StaffMembers
            WHERE PersonId = ? AND ${flag} = 1 AND IsActive = 1
            LIMIT 1`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            personId,
        ])) as any[];
        return rows.length > 0;
    }

    /** Czy dana osoba ma dostęp do rejestru wizyt na budowie (i jest aktywna). */
    static hasSiteVisitAccess(personId: number): Promise<boolean> {
        return this.hasFlag(personId, 'CanLogSiteVisits');
    }

    /** Czy dana osoba ma dostęp do kilometrówki (i jest aktywna). */
    static isDriver(personId: number): Promise<boolean> {
        return this.hasFlag(personId, 'IsDriver');
    }

    /** Czy dana osoba ma dostęp do faktur kosztowych (i jest aktywna). */
    static hasCostInvoiceAccess(personId: number): Promise<boolean> {
        return this.hasFlag(personId, 'HasCostInvoiceAccess');
    }

    /** Czy dana osoba ma dostęp do wyciągów bankowych (i jest aktywna). */
    static hasBankAccess(personId: number): Promise<boolean> {
        return this.hasFlag(personId, 'HasBankAccess');
    }
}
