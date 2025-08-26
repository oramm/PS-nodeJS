import {
    ApplicationCallData,
    EntityData,
    FocusAreaData,
    FinancialAidProgrammeData,
} from '../../types/types';
import mysql from 'mysql2/promise';
import Need from './Need';
import BaseRepository from '../../repositories/BaseRepository';

export interface NeedSearchParams {
    id?: number;
    clientId?: number;
    _client?: EntityData;
    status?: string;
    searchText?: string;
    _financialAidProgramme?: FinancialAidProgrammeData;
    _focusArea?: FocusAreaData;
    _applicationCall?: ApplicationCallData;
}

export default class NeedRepository extends BaseRepository<Need> {
    constructor() {
        super('Needs');
    }

    protected mapRowToEntity(row: any): Need {
    const applicationCall: ApplicationCallData | undefined =
        row.ApplicationCallId
            ? {
                  id: row.ApplicationCallId,
                  startDate: row.ApplicationCallStartDate,
                  endDate: row.ApplicationCallEndDate,
                  status: row.ApplicationCallStatus,
                  description: row.ApplicationCallDescription,
                  url: row.ApplicationCallUrl,
                  gdFolderId: row.ApplicationCallGdFolderId,
                  _focusArea: {
                      id: row.ApplicationCallFocusAreaId,
                      name: row.ApplicationCallFocusAreaName,
                      alias: row.ApplicationCallFocusAreaAlias,
                      description: row.ApplicationCallFocusAreaDescription,
                      gdFolderId: row.ApplicationCallFocusAreaGdFolderId,
                      _financialAidProgramme: {
                          id: row.ApplicationCallFinancialAidProgrammeId,
                          name: row.ApplicationCallFinancialAidProgrammeName,
                          alias: row.ApplicationCallFinancialAidProgrammeAlias,
                          url: row.ApplicationCallFinancialAidProgrammeUrl,
                          description: row.ApplicationCallFinancialAidProgrammeDescription,
                          gdFolderId: row.ApplicationCallFinancialAidProgrammeGdFolderId,
                      },
                  },
              }
            : undefined;

    const focusAreasNames: string[] | undefined = row.FocusAreasNames
        ? row.FocusAreasNames.split(', ')
        : undefined;

    return new Need({
        id: row.Id,
        name: row.Name,
        description: row.Description,
        status: row.Status,
        _client: {
            id: row.ClientId,
            name: row.ClientName,
        },
        _applicationCall: applicationCall,
        _focusAreasNames: focusAreasNames,
    });
}

    async find(
        orConditions: NeedSearchParams[] = []): Promise<Need[]> {
            const conditions = 
            orConditions.length > 0
            ? this.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )
            : '1';
        
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
        WHERE ${conditions}
        GROUP BY Needs.Id
        ORDER BY Needs.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToEntity(row));
    }

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
                `(Needs.Name LIKE ${mysql.escape(`%${word}%`)}
                OR Needs.Description LIKE ${mysql.escape(`%${word}%`)})`
            );

        return conditions.join(' AND ');
    }

    private makeAndConditions(searchParams: NeedSearchParams) {
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
    }}