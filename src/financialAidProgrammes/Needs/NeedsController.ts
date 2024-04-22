import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
import {
    NeedData,
    FocusAreaData,
    EntityData,
    FinancialAidProgrammeData,
    ApplicationCallData,
} from '../../types/types';
import NeedsFocusAreasController from '../NeedsFocusAreas/NeedsFocusAreasController';
import ApplicationCall from '../FocusAreas/ApplicationCalls/ApplicationCall';

type NeedSearchParams = {
    id?: number;
    clientId?: number;
    _client?: EntityData;
    status?: string;
    searchText?: string;
    _financialAidProgramme?: FinancialAidProgrammeData;
    _focusArea?: FocusAreaData;
    _applicationCall?: ApplicationCallData;
};

export default class NeedsController {
    static async getNeedsList(orConditions: NeedSearchParams[] = []) {
        const sql = `SELECT Needs.Id,
            Needs.ClientId,
            Needs.Name,
            Needs.Description,
            Needs.Status,
            Entities.Name as ClientName,
            ApplicationCalls.Id AS ApplicationCallId,
            ApplicationCalls.StartDate AS ApplicationCallStartDate,
            ApplicationCalls.EndDate AS ApplicationCallEndDate,
            ApplicationCalls.Status AS ApplicationCallStatus,
            ApplicationCalls.Description AS ApplicationCallDescription,
            ApplicationCalls.Url AS ApplicationCallUrl,
            ApplicationCallFocusArea.Id AS ApplicationCallFocusAreaId,
            ApplicationCallFocusArea.Name AS ApplicationCallFocusAreaName,
            ApplicationCallFocusArea.Alias AS ApplicationCallFocusAreaAlias,
            ApplicationCallFocusArea.Description AS ApplicationCallFocusAreaDescription,
            ApplicationCallFinancialAidProgramme.Id AS ApplicationCallFinancialAidProgrammeId,
            ApplicationCallFinancialAidProgramme.Name AS ApplicationCallFinancialAidProgrammeName,
            ApplicationCallFinancialAidProgramme.Alias AS ApplicationCallFinancialAidProgrammeAlias,
            ApplicationCallFinancialAidProgramme.Url AS ApplicationCallFinancialAidProgrammeUrl,
            GROUP_CONCAT(DISTINCT FocusAreas.Name ORDER BY FocusAreas.Name ASC SEPARATOR ', ') AS FocusAreasNames
        FROM Needs
        JOIN Entities ON Needs.ClientId = Entities.Id
        LEFT JOIN Needs_FocusAreas ON Needs.Id = Needs_FocusAreas.NeedId
        LEFT JOIN FocusAreas ON Needs_FocusAreas.FocusAreaId = FocusAreas.Id
        LEFT JOIN FinancialAidProgrammes ON FocusAreas.FinancialAidProgrammeId = FinancialAidProgrammes.Id
        LEFT JOIN ApplicationCalls ON Needs.ApplicationCallId = ApplicationCalls.Id
        LEFT JOIN FocusAreas AS ApplicationCallFocusArea ON ApplicationCalls.FocusAreaId = ApplicationCallFocusArea.Id
        LEFT JOIN FinancialAidProgrammes AS ApplicationCallFinancialAidProgramme ON ApplicationCallFocusArea.FinancialAidProgrammeId = ApplicationCallFinancialAidProgramme.Id
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        GROUP BY Needs.Id
        ORDER BY Needs.Name ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        const specificNeedId = orConditions[0]?.id;
        return await this.processNeedsResult(result, specificNeedId);
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
        if (searchParams.id) {
            conditions.push(mysql.format(`Needs.Id = ?`, [searchParams.id]));
        }
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

        if (searchParams._financialAidProgramme) {
            conditions.push(
                mysql.format(`FinancialAidProgrammes.Id = ?`, [
                    searchParams._financialAidProgramme.id,
                ])
            );
        }

        if (searchParams._focusArea) {
            conditions.push(
                mysql.format(`FocusAreas.Id = ?`, [searchParams._focusArea.id])
            );
        }

        if (searchParams._applicationCall) {
            conditions.push(
                mysql.format(`ApplicationCalls.Id = ?`, [
                    searchParams._applicationCall.id,
                ])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    static async processNeedsResult(
        result: any[],
        specificNeedId: number | undefined
    ) {
        let newResult: NeedData[] = [];
        let focusAreas: FocusAreaData[] | undefined;
        if (specificNeedId) {
            const associations =
                await NeedsFocusAreasController.getNeedsFocusAreasList([
                    { needId: specificNeedId },
                ]);
            focusAreas = associations.map(
                (association) => association._focusArea
            );
        }
        for (const row of result) {
            const applicationCall = row.ApplicationCallId
                ? new ApplicationCall(<ApplicationCallData>{
                      id: row.ApplicationCallId,
                      startDate: row.ApplicationCallStartDate,
                      endDate: row.ApplicationCallEndDate,
                      status: row.ApplicationCallStatus,
                      description: ToolsDb.sqlToString(
                          row.ApplicationCallDescription
                      ),

                      url: row.ApplicationCallUrl,
                      _focusArea: <FocusAreaData>{
                          id: row.ApplicationCallFocusAreaId,
                          name: row.ApplicationCallFocusAreaName,
                          _financialAidProgramme: <FinancialAidProgrammeData>{
                              id: row.ApplicationCallFinancialAidProgrammeId,
                              name: row.ApplicationCallFinancialAidProgrammeName,
                              alias: row.ApplicationCallFinancialAidProgrammeAlias,
                              url: row.ApplicationCallFinancialAidProgrammeUrl,
                          },
                          alias: row.ApplicationCallFocusAreaAlias,
                          description: ToolsDb.sqlToString(
                              row.ApplicationCallFocusAreaDescription
                          ),
                      },
                  })
                : undefined;
            const item: NeedData = {
                id: row.Id,
                _client: {
                    id: row.ClientId,
                    name: row.ClientName,
                },
                name: row.Name,
                description: ToolsDb.sqlToString(row.Description),
                status: row.Status,
                _applicationCall: applicationCall,
                _focusAreas: focusAreas,
                _focusAreasNames: row.FocusAreasNames
                    ? row.FocusAreasNames.split(', ')
                    : undefined,
            };
            newResult.push(item);
        }
        return newResult;
    }
}
