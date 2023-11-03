import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb'
import Entity from "./Entity";

export type EntitiesSearchParams = {
    projectId?: string;
    id?: number;
    name?: string;
    searchText?: string;
}

export default class EntitiesController {
    static async getEntitiesList(orConditions: EntitiesSearchParams[] = []) {

        const sql = `SELECT  Entities.Id,
                Entities.Name,
                Entities.Address,
                Entities.TaxNumber,
                Entities.Www,
                Entities.Email,
                Entities.Phone,
                Entities.Fax
            FROM Entities
            WHERE ${ToolsDb.makeOrGroupsConditions(orConditions, this.makeAndConditions.bind(this))}
            ORDER BY Entities.Name;`

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processEntitiesResult(result);
    }

    static makeAndConditions(searchParams: EntitiesSearchParams) {
        const projectCondition = searchParams.projectId
            ? mysql.format(`Contracts.ProjectOurId = ?`, [searchParams.projectId])
            : '1';

        const idCondition = searchParams.id
            ? mysql.format(`Entities.Id = ?`, [searchParams.id])
            : '1';

        const nameCondition = searchParams.name
            ? mysql.format(`Entities.Name LIKE ?`, [`%${searchParams.name}%`])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(searchParams.searchText);

        return `${projectCondition} 
            AND ${idCondition}
            AND ${nameCondition}
            AND ${searchTextCondition}`;
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1'
        if (searchText) searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map(word =>
            mysql.format(`(Entities.Name LIKE ?
                OR Entities.Address LIKE ?
                OR Entities.Email LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`]));

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }
    static processEntitiesResult(result: any[]): [Entity?] {
        let newResult: [Entity?] = [];

        for (const row of result) {
            const item = new Entity({
                id: row.Id,
                name: ToolsDb.sqlToString(row.Name),
                address: ToolsDb.sqlToString(row.Address),
                taxNumber: row.TaxNumber,
                www: row.Www,
                email: row.Email,
                phone: row.Phone,
                fax: row.Fax
            });
            newResult.push(item);
        }
        return newResult;
    }
}