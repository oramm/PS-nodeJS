import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';
import ScrumboardAbsence from './ScrumboardAbsence';
import { dbDateToStr } from './vacationDateUtils';

export interface AbsenceSearchParams {
    /** zwraca nieobecności zachodzące na przedział [rangeStart, rangeEnd] (włącznie) */
    rangeStart?: string;
    rangeEnd?: string;
    personIds?: number[];
}

/** Repozytorium nieobecności (urlopów). Zakresowe, JOIN po typie do prezentacji. */
export default class ScrumboardAbsenceRepository extends BaseRepository<ScrumboardAbsence> {
    constructor() {
        super('ScrumboardAbsences');
    }

    protected mapRowToModel(row: any): ScrumboardAbsence {
        return new ScrumboardAbsence({
            id: row.Id,
            personId: row.PersonId,
            typeId: row.TypeId,
            dateFrom: dbDateToStr(row.DateFrom),
            dateTo: dbDateToStr(row.DateTo),
            workingDaysCount: row.WorkingDaysCount,
            note: row.Note,
            createdByPersonId: row.CreatedByPersonId,
            _typeName: row.TypeName,
            _typeColor: row.TypeColor,
            _countsAgainstLimit: !!row.CountsAgainstLimit,
        });
    }

    async find(params: AbsenceSearchParams = {}): Promise<ScrumboardAbsence[]> {
        const conditions: string[] = [];
        const values: any[] = [];

        // Nachodzenie na przedział: DateFrom <= rangeEnd AND DateTo >= rangeStart
        if (params.rangeEnd) {
            conditions.push('a.DateFrom <= ?');
            values.push(params.rangeEnd);
        }
        if (params.rangeStart) {
            conditions.push('a.DateTo >= ?');
            values.push(params.rangeStart);
        }
        if (params.personIds && params.personIds.length > 0) {
            conditions.push(
                `a.PersonId IN (${params.personIds.map(() => '?').join(', ')})`
            );
            values.push(...params.personIds);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const sql = `SELECT a.Id, a.PersonId, a.TypeId, a.DateFrom, a.DateTo,
                a.WorkingDaysCount, a.Note, a.CreatedByPersonId,
                t.Name AS TypeName, t.Color AS TypeColor, t.CountsAgainstLimit
            FROM ScrumboardAbsences a
            JOIN ScrumboardAbsenceTypes t ON t.Id = a.TypeId
            ${where}
            ORDER BY a.DateFrom`;
        const rows = await ToolsDb.getQueryCallbackAsync(sql, undefined, values);
        return (Array.isArray(rows) ? rows : []).map((row) =>
            this.mapRowToModel(row)
        );
    }

    async findById(id: number): Promise<ScrumboardAbsence | undefined> {
        const sql = `SELECT a.Id, a.PersonId, a.TypeId, a.DateFrom, a.DateTo,
                a.WorkingDaysCount, a.Note, a.CreatedByPersonId,
                t.Name AS TypeName, t.Color AS TypeColor, t.CountsAgainstLimit
            FROM ScrumboardAbsences a
            JOIN ScrumboardAbsenceTypes t ON t.Id = a.TypeId
            WHERE a.Id = ?`;
        const rows = await ToolsDb.getQueryCallbackAsync(sql, undefined, [id]);
        const list = Array.isArray(rows) ? rows : [];
        return list.length ? this.mapRowToModel(list[0]) : undefined;
    }

    /** Wstawia nieobecność, zwraca nadane Id. */
    async insert(absence: ScrumboardAbsence): Promise<number> {
        const sql = `INSERT INTO ScrumboardAbsences
                (PersonId, TypeId, DateFrom, DateTo, WorkingDaysCount, Note, CreatedByPersonId)
            VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const result: any = await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            absence.personId,
            absence.typeId,
            absence.dateFrom,
            absence.dateTo,
            absence.workingDaysCount,
            absence.note,
            absence.createdByPersonId,
        ]);
        return result.insertId;
    }

    async update(absence: ScrumboardAbsence): Promise<void> {
        const sql = `UPDATE ScrumboardAbsences
            SET TypeId = ?, DateFrom = ?, DateTo = ?, WorkingDaysCount = ?, Note = ?
            WHERE Id = ?`;
        await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            absence.typeId,
            absence.dateFrom,
            absence.dateTo,
            absence.workingDaysCount,
            absence.note,
            absence.id,
        ]);
    }

    async deleteById(id: number): Promise<void> {
        await ToolsDb.getQueryCallbackAsync(
            'DELETE FROM ScrumboardAbsences WHERE Id = ?',
            undefined,
            [id]
        );
    }
}
