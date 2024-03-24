import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { FocusAreaData } from '../types/types';

type FocusAreaSearchParams = {
    id?: number;
    searchText?: string;
};

export default class FocusAreasController {
    static async getFocusAreasList(orConditions: FocusAreaSearchParams[] = []) {
        const sql = `SELECT FocusAreas.Id,
            FocusAreas.Name,
            FocusAreas.Description
            FocusAreas.ProgrammeId,
            FinancialAidProgrammes.Name as ProgrammeName,
            FinancialAidProgrammes.Description as ProgrammeDescription,
            FinancialAidProgrammes.Url as ProgrammeUrl
        FROM FocusAreas
        JOIN FinancialAidProgrammes ON FocusAreas.ProgrammeId = FinancialAidProgrammes.Id
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
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );

        return `${searchTextCondition}`;
    }

    static processFocusAreasResult(result: any[]): FocusAreaData[] {
        let newResult: FocusAreaData[] = [];

        for (const row of result) {
            const item: FocusAreaData = {
                id: row.Id,
                name: row.Name,
                description: ToolsDb.sqlToString(row.Description),
                programmeId: row.ProgrammeId,
                _programme: {
                    id: row.ProgrammeId,
                    name: row.ProgrammeName,
                    description: ToolsDb.sqlToString(row.ProgrammeDescription),
                    url: row.ProgrammeUrl,
                },
            };
            newResult.push(item);
        }
        return newResult;
    }
}
