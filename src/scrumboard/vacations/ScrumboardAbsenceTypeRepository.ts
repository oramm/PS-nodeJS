import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';

/**
 * Typ nieobecności (słownik).
 * countsAgainstLimit => schodzi z limitu urlopu; countsAsCare => schodzi z puli opieki;
 * countsAsHoliday => schodzi z puli wolnego za święta wypadające w sobotę.
 */
export interface ScrumboardAbsenceType {
    id: number;
    name: string;
    color: string;
    countsAgainstLimit: boolean;
    countsAsCare: boolean;
    countsAsHoliday: boolean;
}

/** Repozytorium słownika typów nieobecności (tylko odczyt z UI). */
export default class ScrumboardAbsenceTypeRepository extends BaseRepository<ScrumboardAbsenceType> {
    constructor() {
        super('ScrumboardAbsenceTypes');
    }

    protected mapRowToModel(row: any): ScrumboardAbsenceType {
        return {
            id: row.Id,
            name: row.Name,
            color: row.Color,
            countsAgainstLimit: !!row.CountsAgainstLimit,
            countsAsCare: !!row.CountsAsCare,
            countsAsHoliday: !!row.CountsAsHoliday,
        };
    }

    async find(): Promise<ScrumboardAbsenceType[]> {
        const sql = `SELECT Id, Name, Color, CountsAgainstLimit, CountsAsCare, CountsAsHoliday
            FROM ScrumboardAbsenceTypes ORDER BY Id`;
        const rows = await ToolsDb.getQueryCallbackAsync(sql);
        return (Array.isArray(rows) ? rows : []).map((row) =>
            this.mapRowToModel(row)
        );
    }
}
