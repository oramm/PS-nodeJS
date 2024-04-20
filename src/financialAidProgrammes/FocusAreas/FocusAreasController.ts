import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import { FinancialAidProgrammeData, FocusAreaData } from '../../types/types';
import ToolsGd from '../../tools/ToolsGd';

type FocusAreaSearchParams = {
    id?: number;
    searchText?: string;
    _financialAidProgramme?: FinancialAidProgrammeData;
};

export default class FocusAreasController {
    static async getFocusAreasList(orConditions: FocusAreaSearchParams[] = []) {
        const sql = `SELECT FocusAreas.Id,
            FocusAreas.Name,
            FocusAreas.Alias,
            FocusAreas.Description,
            FocusAreas.FinancialAidProgrammeId,
            FocusAreas.GdFolderId,
            FinancialAidProgrammes.Name as ProgrammeName,
            FinancialAidProgrammes.Alias as ProgrammeAlias,
            FinancialAidProgrammes.Description as ProgrammeDescription,
            FinancialAidProgrammes.Url as ProgrammeUrl,
            FinancialAidProgrammes.GdFolderId as ProgrammeGdFolderId
        FROM FocusAreas
        JOIN FinancialAidProgrammes ON FocusAreas.FinancialAidProgrammeId = FinancialAidProgrammes.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY FocusAreas.Name ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processFocusAreasResult(result);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(FocusAreas.Name LIKE ? 
                    OR FocusAreas.Description LIKE ? 
                 )`,
                [`%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: FocusAreaSearchParams) {
        const conditions: string[] = [];

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        if (searchParams._financialAidProgramme) {
            conditions.push(
                mysql.format(`FinancialAidProgrammes.Id = ?`, [
                    searchParams._financialAidProgramme.id,
                ])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    static processFocusAreasResult(result: any[]): FocusAreaData[] {
        let newResult: FocusAreaData[] = [];

        for (const row of result) {
            const item: FocusAreaData = {
                id: row.Id,
                name: row.Name,
                alias: row.Alias,
                description: ToolsDb.sqlToString(row.Description),
                financialAidProgrammeId: row.FinancialAidProgrammeId,
                _financialAidProgramme: {
                    id: row.FinancialAidProgrammeId,
                    name: row.ProgrammeName,
                    alias: row.ProgrammeAlias,
                    description: ToolsDb.sqlToString(row.ProgrammeDescription),
                    url: row.ProgrammeUrl,
                    gdFolderId: row.ProgrammeGdFolderId,
                },
                gdFolderId: row.GdFolderId,
                _gdFolderUrl: ToolsGd.createGdFolderUrl(row.GdFolderId),
            };
            newResult.push(item);
        }
        return newResult;
    }
}
