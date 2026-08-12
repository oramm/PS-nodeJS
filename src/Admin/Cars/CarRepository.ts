import { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import BaseRepository from '../../repositories/BaseRepository';
import Car from './Car';

export type CarsSearchParams = {
    id?: number;
    isActive?: boolean;
    searchText?: string;
};

/**
 * Repository dla słownika samochodów.
 * Tabela: Cars
 */
export default class CarRepository extends BaseRepository<Car> {
    constructor() {
        super('Cars');
    }

    async find(orConditions: CarsSearchParams[] = [{}]): Promise<Car[]> {
        const sql = `SELECT
                Cars.Id,
                Cars.Brand,
                Cars.Model,
                Cars.LicensePlateNumber,
                Cars.MileageSpreadsheetId,
                Cars.MileageSheetGid,
                Cars.IsActive,
                Cars.Comment
            FROM Cars
            WHERE ${this.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY Cars.Brand, Cars.Model`;

        const result = <RowDataPacket[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    private makeAndConditions(searchParams: CarsSearchParams): string {
        const conditions: string[] = [];

        if (searchParams.id !== undefined)
            conditions.push(mysql.format('Cars.Id = ?', [searchParams.id]));

        if (searchParams.isActive !== undefined)
            conditions.push(
                mysql.format('Cars.IsActive = ?', [searchParams.isActive ? 1 : 0])
            );

        if (searchParams.searchText)
            conditions.push(this.makeSearchTextCondition(searchParams.searchText));

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    /** Każde słowo z frazy musi wystąpić w marce, modelu albo numerze rejestracyjnym. */
    private makeSearchTextCondition(searchText: string): string {
        const words = searchText.split(' ').filter((word) => word.length > 0);
        const conditions = words.map((word) =>
            mysql.format(
                `(Cars.Brand LIKE ? OR Cars.Model LIKE ? OR Cars.LicensePlateNumber LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`]
            )
        );
        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    protected mapRowToModel(row: RowDataPacket): Car {
        return new Car({
            id: row.Id,
            brand: row.Brand,
            model: row.Model,
            licensePlateNumber: row.LicensePlateNumber,
            mileageSpreadsheetId: row.MileageSpreadsheetId,
            mileageSheetGid:
                row.MileageSheetGid !== null && row.MileageSheetGid !== undefined
                    ? Number(row.MileageSheetGid)
                    : null,
            isActive: !!row.IsActive,
            comment: row.Comment,
        });
    }
}
