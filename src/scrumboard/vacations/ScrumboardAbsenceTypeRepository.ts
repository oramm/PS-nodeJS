import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';

/**
 * Typ nieobecności (słownik).
 * countsAgainstLimit => schodzi z limitu urlopu; countsAsCare => schodzi z puli opieki.
 */
export interface ScrumboardAbsenceType {
    id: number;
    name: string;
    color: string;
    countsAgainstLimit: boolean;
    countsAsCare: boolean;
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
        };
    }

    async find(): Promise<ScrumboardAbsenceType[]> {
        const sql = `SELECT Id, Name, Color, CountsAgainstLimit, CountsAsCare
            FROM ScrumboardAbsenceTypes ORDER BY Id`;
        const rows = await ToolsDb.getQueryCallbackAsync(sql);
        return (Array.isArray(rows) ? rows : []).map((row) =>
            this.mapRowToModel(row)
        );
    }
}
