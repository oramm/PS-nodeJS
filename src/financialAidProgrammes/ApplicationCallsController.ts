import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { ApplicationCallData, FocusAreaData } from '../types/types';

type ApplicationCallSearchParams = {
    id?: number;
    focusAreaId?: number;
    _focusArea?: FocusAreaData;
    startDate?: string;
    endDate?: string;
    status?: string;
    searchText?: string;
};

export default class FocusAreasController {
    static async getApplicationCallsList(
        orConditions: ApplicationCallSearchParams[] = []
    ) {
        const sql = `SELECT ApplicationCalls.Id,
            ApplicationCalls.Description,
            ApplicationCalls.Url,
            ApplicationCalls.StartDate,
            ApplicationCalls.EndDate,
            ApplicationCalls.Status
            FocusAreas.Id as FocusAreaId,
            FocusAreas.Name as FocusAreaName,
            FocusAreas.Description as FocusAreaDescription,
            Programmes.Id as ProgrammeId,
            Programmes.Name as ProgrammeName,
            Programmes.Description as ProgrammeDescription,
            Programmes.Url as ProgrammeUrl
        FROM ApplicationCalls
        JOIN FocusAreas ON ApplicationCalls.FocusAreaId = FocusAreas.Id
        JOIN FinancialAidProgrammes ON FocusAreas.ProgrammeId = FinancialAidProgrammes.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        ORDER BY ApplicationCalls.StartDate ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processApplicationCallsResult(result);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(ApplicationCalls.Description LIKE ? 
                    OR ApplicationCalls.Url LIKE ?)`,
                [`%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: ApplicationCallSearchParams) {
        const conditions: string[] = [];
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        const focusAreaId =
            searchParams.focusAreaId || searchParams._focusArea?.id;
        if (focusAreaId) {
            conditions.push(
                mysql.format(`ApplicationCalls.FocusAreaId = ?`, [focusAreaId])
            );
        }

        if (searchParams.startDate) {
            conditions.push(
                mysql.format(`ApplicationCalls.StartDate >= ?`, [
                    searchParams.startDate,
                ])
            );
        }

        if (searchParams.endDate) {
            conditions.push(
                mysql.format(`ApplicationCalls.EndDate <= ?`, [
                    searchParams.endDate,
                ])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    static processApplicationCallsResult(result: any[]): ApplicationCallData[] {
        let newResult: ApplicationCallData[] = [];

        for (const row of result) {
            const item: ApplicationCallData = {
                id: row.Id,
                _focusArea: {
                    id: row.FocusAreaId,
                    name: row.FocusAreaName,
                    description: ToolsDb.sqlToString(row.FocusAreaDescription),
                    _programme: {
                        id: row.ProgrammeId,
                        name: row.ProgrammeName,
                        description: ToolsDb.sqlToString(
                            row.ProgrammeDescription
                        ),
                        url: row.ProgrammeUrl,
                    },
                },
                description: ToolsDb.sqlToString(row.Description),
                url: row.Url,
                startDate: row.StartDate,
                endDate: row.EndDate,
                status: row.Status,
            };
            newResult.push(item);
        }
        return newResult;
    }
}
