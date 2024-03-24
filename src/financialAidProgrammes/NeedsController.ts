import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { NeedData, FocusAreaData, EntityData } from '../types/types';

type NeedSearchParams = {
    id?: number;
    clientId?: number;
    _client?: EntityData;
    status?: string;
    searchText?: string;
};

export default class NeedsController {
    static async getNeedsList(orConditions: NeedSearchParams[] = []) {
        const sql = `SELECT Needs.Id,
            Needs.ClientId,
            Needs.Name,
            Needs.Description,
            Needs.Status,
            Entities.Name as ClientName
        FROM Needs
        JOIN Entities ON Needs.ClientId = Entities.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY Needs.Name ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processNeedsResult(result);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Needs.Name LIKE ? 
                    OR Needs.Description LIKE ?)`,
                [`%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: NeedSearchParams) {
        const conditions: string[] = [];
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }
        const clientId = searchParams.clientId || searchParams._client?.id;
        if (clientId) {
            conditions.push(mysql.format(`Needs.ClientId = ?`, [clientId]));
        }

        if (searchParams.status) {
            conditions.push(
                mysql.format(`Needs.Status = ?`, [searchParams.status])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    static processNeedsResult(result: any[]): NeedData[] {
        let newResult: NeedData[] = [];

        for (const row of result) {
            const item: NeedData = {
                id: row.Id,
                _client: {
                    id: row.ClientId,
                    name: row.ClientName,
                },
                name: row.Name,
                description: ToolsDb.sqlToString(row.Description),
                status: row.Status,
            };
            newResult.push(item);
        }
        return newResult;
    }
}
