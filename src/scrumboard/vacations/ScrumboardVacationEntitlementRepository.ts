import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';

export interface VacationEntitlement {
    personId: number;
    year: number;
    limitDays: number;
    carryoverDays: number;
    careDays: number;
}

/** Repozytorium rocznego wymiaru urlopu per osoba. Klucz (PersonId, Year) → UPSERT. */
export default class ScrumboardVacationEntitlementRepository extends BaseRepository<VacationEntitlement> {
    constructor() {
        super('ScrumboardVacationEntitlements');
    }

    protected mapRowToModel(row: any): VacationEntitlement {
        return {
            personId: row.PersonId,
            year: row.Year,
            limitDays: Number(row.LimitDays),
            carryoverDays: Number(row.CarryoverDays),
            careDays: Number(row.CareDays),
        };
    }

    async find(year: number): Promise<VacationEntitlement[]> {
        const sql = `SELECT PersonId, Year, LimitDays, CarryoverDays, CareDays
            FROM ScrumboardVacationEntitlements WHERE Year = ?`;
        const rows = await ToolsDb.getQueryCallbackAsync(sql, undefined, [year]);
        return (Array.isArray(rows) ? rows : []).map((row) =>
            this.mapRowToModel(row)
        );
    }

    /** Ustawia wymiar urlopu (bieżący + zaległy + opieka) dla osoby w danym roku (UPSERT). */
    async upsert(
        personId: number,
        year: number,
        limitDays: number,
        carryoverDays: number,
        careDays: number
    ): Promise<VacationEntitlement> {
        const sql = `INSERT INTO ScrumboardVacationEntitlements
                (PersonId, Year, LimitDays, CarryoverDays, CareDays)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                LimitDays = VALUES(LimitDays),
                CarryoverDays = VALUES(CarryoverDays),
                CareDays = VALUES(CareDays)`;
        await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            personId,
            year,
            limitDays,
            carryoverDays,
            careDays,
        ]);
        return { personId, year, limitDays, carryoverDays, careDays };
    }
}
