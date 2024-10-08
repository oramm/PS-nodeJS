import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import City from './City';

export type CitiesSearchParams = {
    searchText?: string;
    id?: number;
    code?: string;
    name?: string;
};

export default class CitiesController {
    static async getCitiesList(orConditions: CitiesSearchParams[] = []) {
        const sql = `SELECT Cities.Id, 
            Cities.Name, 
            Cities.Code
          FROM Cities
          WHERE ${ToolsDb.makeOrGroupsConditions(
              orConditions,
              this.makeAndConditions.bind(this)
          )}
          ORDER BY Cities.Name ASC`;

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            return await this.processCitiesResult(result, orConditions[0]);
        } catch (err) {
            console.log(sql);
            throw err;
        }
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        if (searchText) searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Cities.Name LIKE ?
                OR Cities.Code LIKE ?)`,
                [`%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: CitiesSearchParams) {
        const conditions = [];

        if (searchParams.id) {
            conditions.push(mysql.format(`Cities.Id = ?`, [searchParams.id]));
        }
        if (searchParams.code) {
            conditions.push(
                mysql.format(`Cities.Code = ?`, [searchParams.code])
            );
        }
        if (searchParams.name) {
            conditions.push(
                mysql.format(`Cities.Name = ?`, [searchParams.name])
            );
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    private static async processCitiesResult(
        result: any[],
        initParamObject: CitiesSearchParams
    ) {
        const newResult: City[] = [];

        for (const row of result) {
            let item: City;
            item = new City({
                id: row.Id,
                name: ToolsDb.sqlToString(row.Name),
                code: row.Code,
            });

            newResult.push(item);
        }
        return newResult;
    }
}
