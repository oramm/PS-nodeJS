import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import BaseRepository from '../../repositories/BaseRepository';
import AbsenceType from './AbsenceType';

export type AbsenceTypesSearchParams = {
    id?: number;
    searchText?: string;
};

/**
 * Repository słownika typów nieobecności.
 * Tabela: ScrumboardAbsenceTypes
 */
export default class AbsenceTypeRepository extends BaseRepository<AbsenceType> {
    constructor() {
        super('ScrumboardAbsenceTypes');
    }

    /**
     * Zwraca typy wraz z liczbą użyć - panel musi pokazać, dlaczego usunięcie
     * typu jest zablokowane (ScrumboardAbsences.TypeId ma ON DELETE RESTRICT).
     */
    async find(
        orConditions: AbsenceTypesSearchParams[] = [{}]
    ): Promise<AbsenceType[]> {
        const sql = `SELECT
                ScrumboardAbsenceTypes.Id,
                ScrumboardAbsenceTypes.Name,
                ScrumboardAbsenceTypes.Color,
                ScrumboardAbsenceTypes.CountsAgainstLimit,
                ScrumboardAbsenceTypes.CountsAsCare,
                COUNT(ScrumboardAbsences.Id) AS UsageCount
            FROM ScrumboardAbsenceTypes
            LEFT JOIN ScrumboardAbsences
                ON ScrumboardAbsences.TypeId = ScrumboardAbsenceTypes.Id
            WHERE ${this.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            GROUP BY ScrumboardAbsenceTypes.Id
            ORDER BY ScrumboardAbsenceTypes.Id`;

        const result = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    private makeAndConditions(searchParams: AbsenceTypesSearchParams): string {
        const conditions: string[] = [];

        if (searchParams.id !== undefined)
            conditions.push(
                mysql.format('ScrumboardAbsenceTypes.Id = ?', [searchParams.id])
            );

        if (searchParams.searchText)
            conditions.push(
                mysql.format('ScrumboardAbsenceTypes.Name LIKE ?', [
                    `%${searchParams.searchText}%`,
                ])
            );

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    protected mapRowToModel(row: RowDataPacket): AbsenceType {
        return new AbsenceType({
            id: row.Id,
            name: row.Name,
            color: row.Color,
            countsAgainstLimit: !!row.CountsAgainstLimit,
            countsAsCare: !!row.CountsAsCare,
            _usageCount: Number(row.UsageCount ?? 0),
        });
    }
}
