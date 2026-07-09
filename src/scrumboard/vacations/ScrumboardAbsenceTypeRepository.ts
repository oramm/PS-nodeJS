import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';

/** Typ nieobecności (słownik). CountsAgainstLimit => czy schodzi z limitu urlopu. */
export interface ScrumboardAbsenceType {
    id: number;
    name: string;
    color: string;
    countsAgainstLimit: boolean;
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
        };
    }

    async find(): Promise<ScrumboardAbsenceType[]> {
        const sql = `SELECT Id, Name, Color, CountsAgainstLimit
            FROM ScrumboardAbsenceTypes ORDER BY Id`;
        const rows = await ToolsDb.getQueryCallbackAsync(sql);
        return (Array.isArray(rows) ? rows : []).map((row) =>
            this.mapRowToModel(row)
        );
    }
}
