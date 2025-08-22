import BaseRepository from "../../repositories/BaseRepository";
import FocusArea from "./FocusArea";
import mysql from "mysql2/promise";
import ToolsDb from "../../tools/ToolsDb";
import ToolsGd from "../../tools/ToolsGd";
import { FinancialAidProgrammeData } from '../../types/types';

export interface FocusAreasSearchParams {
    id?: number;
    searchText?: string;
    _financialAidProgramme?: FinancialAidProgrammeData;
};

export default class FocusAreaRepository extends BaseRepository<FocusArea> {
    constructor() {
        super('FocusAreas');
    }

    protected mapRowToEntity(row: any): FocusArea {
        return new FocusArea({
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
            });
        };

    async find(orConditions: FocusAreasSearchParams[] = []) {
        const conditions = 
            orConditions.length > 0
                ? ToolsDb.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';

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
        WHERE ${conditions}
        ORDER BY FocusAreas.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToEntity(row));
    }

    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
            `(FocusAreas.Name LIKE ${mysql.escape(`%${word}%`)}
                OR FocusAreas.Description LIKE ${mysql.escape(`%${word}%`)})`
        );
        return conditions.join(' AND ');
    }

    private makeAndConditions(searchParams: FocusAreasSearchParams): string {
        const conditions: string[] = [];

        if (searchParams._financialAidProgramme) {
            conditions.push(mysql.format(`FinancialAidProgrammes.Id = ?`, [searchParams._financialAidProgramme.id]));
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition) {
            conditions.push(searchTextCondition);
        }
        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }
    }