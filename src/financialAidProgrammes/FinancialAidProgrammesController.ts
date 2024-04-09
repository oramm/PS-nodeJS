import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { FinancialAidProgrammeData } from '../types/types';
import ToolsGd from '../tools/ToolsGd';

type FinancialAidProgrammesearchParams = {
    id?: number;
    searchText?: string;
};

export default class FinancialAidProgrammesController {
    static async getFinancialAidProgrammesList(
        orConditions: FinancialAidProgrammesearchParams[] = []
    ) {
        const sql = `SELECT FinancialAidProgrammes.Id,
            FinancialAidProgrammes.Name,
            FinancialAidProgrammes.Alias,
            FinancialAidProgrammes.Description,
            FinancialAidProgrammes.Url,
            FinancialAidProgrammes.GdFolderId
        FROM FinancialAidProgrammes
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY FinancialAidProgrammes.Name ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processFinancialAidProgrammesResult(result);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(FinancialAidProgrammes.Name LIKE ? 
                    OR FinancialAidProgrammes.Description LIKE ?
                    OR FinancialAidProgrammes.Alias LIKE ?
                 )`,
                [`%${word}%`, `%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: FinancialAidProgrammesearchParams) {
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );

        return `${searchTextCondition}`;
    }

    static processFinancialAidProgrammesResult(
        result: any[]
    ): FinancialAidProgrammeData[] {
        let newResult: FinancialAidProgrammeData[] = [];

        for (const row of result) {
            const item: FinancialAidProgrammeData = {
                id: row.Id,
                name: row.Name,
                alias: row.Alias,
                description: ToolsDb.sqlToString(row.Description),
                url: row.Url,
                gdFolderId: row.GdFolderId,
                _gdFolderUrl: ToolsGd.createGdFolderUrl(row.GdFolderId),
            };
            newResult.push(item);
        }
        return newResult;
    }
}
