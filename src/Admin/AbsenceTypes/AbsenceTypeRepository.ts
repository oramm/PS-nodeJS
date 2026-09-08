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
     *
     * Osobno liczy nieobecności wpisane NA GODZINY. Panel ostrzega przed zdjęciem
     * kratki "można brać na godziny", gdy takie wpisy istnieją: zostają w kalendarzu
     * i dalej się liczą, ale przestają dawać się edytować, dopóki kratka nie wróci.
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
                ScrumboardAbsenceTypes.CountsAsHoliday,
                ScrumboardAbsenceTypes.AllowsPartialDay,
                COUNT(ScrumboardAbsences.Id) AS UsageCount,
                SUM(ScrumboardAbsences.StartTime IS NOT NULL) AS PartialUsageCount
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
            countsAsHoliday: !!row.CountsAsHoliday,
            allowsPartialDay: !!row.AllowsPartialDay,
            _usageCount: Number(row.UsageCount ?? 0),
            _partialUsageCount: Number(row.PartialUsageCount ?? 0),
        });
    }
}
