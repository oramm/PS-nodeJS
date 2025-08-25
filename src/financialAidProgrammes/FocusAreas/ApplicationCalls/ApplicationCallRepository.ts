import mysql from 'mysql2/promise';
import ToolsDb from '../../../tools/ToolsDb';
import {
    ApplicationCallData,
    FinancialAidProgrammeData,
    FocusAreaData,
} from '../../../types/types';
import BaseRepository from '../../../repositories/BaseRepository';
import ApplicationCall from './ApplicationCall';
import ToolsGd from '../../../tools/ToolsGd';

export interface ApplicationCallSearchParams {
    searchText?: string;
    _financialAidProgramme?: FinancialAidProgrammeData;
    focusAreaId?: number;
    _focusArea?: FocusAreaData | FocusAreaData[];
    statuses?: string[];
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
}

export default class ApplicationCallRepository extends BaseRepository<ApplicationCall> {
    constructor() {
        super('ApplicationCalls');
    }

    protected mapRowToEntity(row: any): ApplicationCall {
        return new ApplicationCall({
                id: row.Id,
                _focusArea: <FocusAreaData>{
                    id: row.FocusAreaId,
                    name: row.FocusAreaName,
                    alias: row.FocusAreaAlias,
                    description: ToolsDb.sqlToString(row.FocusAreaDescription),
                    _financialAidProgramme: {
                        id: row.FinancialAidProgrammeId,
                        name: row.ProgrammeName,
                        description: ToolsDb.sqlToString(
                            row.ProgrammeDescription
                        ),
                        url: row.ProgrammeUrl,
                        alias: row.ProgrammeAlias,
                        gdFolderId: row.ProgrammeGdFolderId,
                    },
                    gdFolderId: row.FocusAreaGdFolderId,
                },
                description: ToolsDb.sqlToString(row.Description),
                url: row.Url,
                startDate: row.StartDate,
                endDate: row.EndDate,
                status: row.Status,
                gdFolderId: row.GdFolderId,
                _gdFolderUrl: ToolsGd.createGdFolderUrl(row.GdFolderId),
        });    
    }

    async find(
        orConditions: ApplicationCallSearchParams[] = []): Promise<ApplicationCall[]> {
            const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';
        const sql = `SELECT ApplicationCalls.Id,
            ApplicationCalls.Description,
            ApplicationCalls.Url,
            ApplicationCalls.StartDate,
            ApplicationCalls.EndDate,
            ApplicationCalls.Status,
            ApplicationCalls.GdFolderId,
            FocusAreas.Id as FocusAreaId,
            FocusAreas.Name as FocusAreaName,
            FocusAreas.Alias as FocusAreaAlias,
            FocusAreas.Description as FocusAreaDescription,
            FocusAreas.GdFolderId as FocusAreaGdFolderId,
            FinancialAidProgrammes.Id as FinancialAidProgrammeId,
            FinancialAidProgrammes.Name as ProgrammeName,
            FinancialAidProgrammes.Alias as ProgrammeAlias,
            FinancialAidProgrammes.Description as ProgrammeDescription,
            FinancialAidProgrammes.Url as ProgrammeUrl,
            FinancialAidProgrammes.GdFolderId as ProgrammeGdFolderId
        FROM ApplicationCalls
        JOIN FocusAreas ON ApplicationCalls.FocusAreaId = FocusAreas.Id
        JOIN FinancialAidProgrammes ON FocusAreas.FinancialAidProgrammeId = FinancialAidProgrammes.Id
          WHERE ${conditions}
          ORDER BY ApplicationCalls.StartDate DESC, ApplicationCalls.EndDate DESC`;
        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToEntity(row));
    }

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(ApplicationCalls.Description LIKE ${mysql.escape(`%${word}%`)}
                    OR ApplicationCalls.Url LIKE ${mysql.escape(`%${word}%`)})`
            )
        );
        return conditions.join(' AND ');
    }

    private makeAndConditions(searchParams: ApplicationCallSearchParams) {
        const conditions: string[] = [];
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }
        if (searchParams._financialAidProgramme?.id) {
            conditions.push(
                mysql.format(`FocusAreas.FinancialAidProgrammeId = ?`, [
                    searchParams._financialAidProgramme.id,
                ])
            );
        }

        // Prepare an array to collect all focus area IDs.
        let focusAreaIds: number[] = [];

        // Check if there's a direct ID or a single _focusArea object.
        if (searchParams.focusAreaId) {
            focusAreaIds.push(searchParams.focusAreaId);
        } else if (
            !Array.isArray(searchParams._focusArea) &&
            searchParams._focusArea?.id
        ) {
            focusAreaIds.push(searchParams._focusArea?.id);
        }
        // If _focusArea is an array, add all IDs from it.
        else if (Array.isArray(searchParams._focusArea)) {
            focusAreaIds = focusAreaIds.concat(
                searchParams._focusArea.map((fa) => fa.id as number)
            );
        }

        // Create SQL condition using the IN clause if there are any IDs collected.
        if (focusAreaIds.length) {
            const placeholders = focusAreaIds.map(() => '?').join(', ');
            const focusAreaCondition = mysql.format(
                `ApplicationCalls.FocusAreaId IN (${placeholders})`,
                focusAreaIds
            );
            conditions.push(focusAreaCondition);
        }
        if (searchParams.statuses?.length) {
            const statusPlaceholders = searchParams.statuses
                .map(() => '?')
                .join(',');
            conditions.push(
                mysql.format(
                    `ApplicationCalls.Status IN (${statusPlaceholders})`,
                    searchParams.statuses
                )
            );
        }

        if (searchParams.startDateFrom) {
            conditions.push(
                mysql.format(`ApplicationCalls.StartDate >= ?`, [
                    searchParams.startDateFrom,
                ])
            );
        }

        if (searchParams.startDateTo) {
            conditions.push(
                mysql.format(`ApplicationCalls.StartDate <= ?`, [
                    searchParams.startDateTo,
                ])
            );
        }

        if (searchParams.endDateFrom) {
            conditions.push(
                mysql.format(`ApplicationCalls.EndDate >= ?`, [
                    searchParams.endDateFrom,
                ])
            );
        }

        if (searchParams.endDateTo) {
            conditions.push(
                mysql.format(`ApplicationCalls.EndDate <= ?`, [
                    searchParams.endDateTo,
                ])
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }}