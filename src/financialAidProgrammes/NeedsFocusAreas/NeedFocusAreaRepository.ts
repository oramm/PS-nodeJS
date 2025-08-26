import BaseRepository from "../../repositories/BaseRepository";
import mysql from "mysql2/promise";
import { FocusAreaData, NeedData } from "../../types/types";
import ToolsDb from "../../tools/ToolsDb";
import NeedsFocusArea from "./NeedFocusArea";

export interface NeedsFocusAreasSearchParams {
    needId?: number;
    _need?: NeedData;
    _focusArea?: FocusAreaData;
    focusAreaId?: number;
    searchText?: string;
};

export default class NeedFocusAreaRepository extends BaseRepository<NeedsFocusArea> {
    constructor() {
        super('NeedsFocusAreas');
    }

    protected mapRowToEntity(row: any): NeedsFocusArea {
        return new NeedsFocusArea({
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
                alias: row.FocusAreaAlias,
                description: row.FocusAreaDescription,
                _financialAidProgramme: {
                    id: row.FinancialAidProgrammeId,
                    name: row.ProgrammeName,
                    alias: row.ProgrammeAlias,
                    description: row.ProgrammeDescription,
                    url: row.ProgrammeUrl,
                    gdFolderId: row.ProgrammeGdFolderId,
                },
                gdFolderId: row.FocusAreaGdFolderId,
            }
        });
    }

async find(orConditions: NeedsFocusAreasSearchParams[] = []) {
    const conditions =
        orConditions.length > 0
            ? this.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )
            : '1';

        const sql = `SELECT Needs_FocusAreas.NeedId,
            Needs_FocusAreas.FocusAreaId,
            Needs_FocusAreas.Comment,
            Needs.Name as NeedName,
            Needs.Description as NeedDescription,
            Needs.Status as NeedStatus,
            FocusAreas.Name as FocusAreaName,
            FocusAreas.Alias as FocusAreaAlias,
            FocusAreas.Description as FocusAreaDescription,
            FocusAreas.GdFolderId as FocusAreaGdFolderId,
            FinancialAidProgrammes.Id as FinancialAidProgrammeId,
            FinancialAidProgrammes.Name as ProgrammeName,
            FinancialAidProgrammes.Alias as ProgrammeAlias,
            FinancialAidProgrammes.Description as ProgrammeDescription,
            FinancialAidProgrammes.Url as ProgrammeUrl,
            FinancialAidProgrammes.GdFolderId as ProgrammeGdFolderId,
            Entities.Id as ClientId,
            Entities.Name as ClientName
        FROM Needs_FocusAreas
        JOIN Needs ON Needs_FocusAreas.NeedId = Needs.Id
        JOIN FocusAreas ON Needs_FocusAreas.FocusAreaId = FocusAreas.Id
        LEFT JOIN FinancialAidProgrammes ON FocusAreas.FinancialAidProgrammeId = FinancialAidProgrammes.Id
        JOIN Entities ON Needs.ClientId = Entities.Id
        WHERE ${conditions}
        ORDER BY Needs.Name ASC, FocusAreas.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToEntity(row));
    }

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
                `(Needs.Name LIKE ${mysql.escape(`%${word}%`)} 
                OR FocusAreas.Name LIKE ${mysql.escape(`%${word}%`)} 
                OR Needs_FocusAreas.Comment LIKE ${mysql.escape(`%${word}%`)})`
        );
        return conditions.join(' AND ');
    }

    private makeAndConditions(searchParams: NeedsFocusAreasSearchParams) {
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
}