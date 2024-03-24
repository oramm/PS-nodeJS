import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { FocusAreaData, NeedData, NeedsFocusAreasData } from '../types/types';

type NeedsFocusAreasSearchParams = {
    needId?: number;
    _need?: NeedData;
    _focusArea?: FocusAreaData;
    focusAreaId?: number;
    searchText?: string;
};

export default class NeedsFocusAreasController {
    static async getNeedsFocusAreasList(
        orConditions: NeedsFocusAreasSearchParams[] = []
    ) {
        const sql = `SELECT Needs_FocusAreas.NeedId,
            Needs_FocusAreas.FocusAreaId,
            Needs_FocusAreas.Comment,
            Needs.Name as NeedName,
            Needs.Description as NeedDescription,
            Needs.Status as NeedStatus,
            FocusAreas.Name as FocusAreaName,
            FocusAreas.Description as FocusAreaDescription,
            FinancialAidProgrammes.Id as ProgrammeId,
            FinancialAidProgrammes.Name as ProgrammeName,
            FinancialAidProgrammes.Description as ProgrammeDescription,
            FinancialAidProgrammes.Url as ProgrammeUrl,
            Entities.Id as ClientId,
            Entities.Name as ClientName,

        FROM Needs_FocusAreas
        JOIN Needs ON Needs_FocusAreas.NeedId = Needs.Id
        JOIN FocusAreas ON Needs_FocusAreas.FocusAreaId = FocusAreas.Id
        LEFT JOIN FinancialAidProgrammes ON FocusAreas.ProgrammeId = FinancialAidProgrammes.Id
        JOIN Entities ON Needs.ClientId = Entities.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY Needs.Name ASC, FocusAreas.Name ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processNeedsFocusAreasResult(result);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Needs.Name LIKE ? OR FocusAreas.Name LIKE ? OR Needs_FocusAreas.Comment LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: NeedsFocusAreasSearchParams) {
        const conditions: string[] = [];
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        const needId = searchParams.needId || searchParams._need?.id;
        if (needId) {
            conditions.push(
                mysql.format(`Needs_FocusAreas.NeedId = ?`, [needId])
            );
        }

        const focusAreaId =
            searchParams.focusAreaId || searchParams._focusArea?.id;
        if (focusAreaId) {
            conditions.push(
                mysql.format(`Needs_FocusAreas.FocusAreaId = ?`, [focusAreaId])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    static processNeedsFocusAreasResult(result: any[]): NeedsFocusAreasData[] {
        let newResult: NeedsFocusAreasData[] = [];

        for (const row of result) {
            const item: NeedsFocusAreasData = {
                needId: row.NeedId,
                focusAreaId: row.FocusAreaId,
                comment: row.Comment,
                _need: {
                    id: row.NeedId,
                    name: row.NeedName,
                    description: row.NeedDescription,
                    _client: {
                        id: row.ClientId,
                        name: row.ClientName,
                    },
                    status: row.NeedStatus,
                },
                _focusArea: {
                    id: row.FocusAreaId,
                    name: row.FocusAreaName,
                    description: row.FocusAreaDescription,
                    _programme: {
                        id: row.ProgrammeId,
                        name: row.ProgrammeName,
                        description: row.ProgrammeDescription,
                        url: row.ProgrammeUrl,
                    },
                },
            };
            newResult.push(item);
        }
        return newResult;
    }
}
