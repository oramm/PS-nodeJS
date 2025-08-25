import {
    ApplicationCallData,
    EntityData,
    FocusAreaData,
    FinancialAidProgrammeData,
} from '../../types/types';
import mysql from 'mysql2/promise';
import Need from './Need';
import ToolsDb from '../../tools/ToolsDb';
import ApplicationCall from '../FocusAreas/ApplicationCalls/ApplicationCall';
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
        return new Need({
            id: row.Id,
            name: row.Name,
            description: ToolsDb.sqlToString(row.Description),
            status: row.Status,
            applicationCallId: row.ApplicationCallId,
            clientId: row.ClientId,
            _client: {
                id: row.ClientId,
                name: row.ClientName,
            },
            _applicationCall: <ApplicationCall>{
                id: row.ApplicationCallId,
                startDate: row.ApplicationCallStartDate,
                status: row.ApplicationCallStatus,
                endDate: row.ApplicationCallEndDate,
            },
            // _focusAreas will be set later from Needs_FocusAreas table
            _focusAreasNames: row.FocusAreasNames ? row.FocusAreasNames.split(', ') : [],
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
          ORDER BY Needs.Name DESC`;
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
            )
        ;

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