import BaseRepository from '../../repositories/BaseRepository';
import City from './City';
import mysql from 'mysql2/promise';

export interface CitiesSearchParams {
    searchText?: string;
    id?: number;
    code?: string;
    name?: string;
}

/**
 * Repozytorium dla operacji na miastach
 */
export default class CityRepository extends BaseRepository<City> {
    constructor() {
        super('Cities');
    }

    /**
     * Mapuje surowe dane z bazy na instancję City
     */
    protected mapRowToEntity(row: any): City {
        return new City({
            id: row.Id,
            name: row.Name,
            code: row.Code,
        });
    }

    /**
     * Wyszukuje miasta z opcjonalnymi kryteriami
     */
    async find(orConditions: CitiesSearchParams[] = []): Promise<City[]> {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';

        const sql = `SELECT Cities.Id, 
                            Cities.Name, 
                            Cities.Code
                     FROM Cities
                     WHERE ${conditions}
                     ORDER BY Cities.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToEntity(row));
    }

    /**
     * Pobiera wszystkie kody miast (do sprawdzania unikalności)
     */
    async findAllCodes(): Promise<Set<string>> {
        const sql = `SELECT Cities.Code FROM Cities WHERE Cities.Code IS NOT NULL`;
        const rows = await this.executeQuery(sql);
        return new Set(rows.map((row) => row.Code).filter((code) => code));
    }

    /**
     * Pomocnicza metoda do budowania warunków AND
     */
    private makeAndConditions(searchParams: CitiesSearchParams): string {
        const conditions = [];

        if (searchParams.id) {
            conditions.push(`Cities.Id = ${mysql.escape(searchParams.id)}`);
        }
        if (searchParams.code) {
            conditions.push(`Cities.Code = ${mysql.escape(searchParams.code)}`);
        }
        if (searchParams.name) {
            conditions.push(`Cities.Name = ${mysql.escape(searchParams.name)}`);
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    /**
     * Pomocnicza metoda do budowania warunków wyszukiwania tekstowego
     */
    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
                `(Cities.Name LIKE ${mysql.escape(`%${word}%`)}
                OR Cities.Code LIKE ${mysql.escape(`%${word}%`)})`
        );

        return conditions.join(' AND ');
    }
}
