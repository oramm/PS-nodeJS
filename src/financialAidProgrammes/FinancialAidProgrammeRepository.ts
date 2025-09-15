import BaseRepository from '../repositories/BaseRepository';
import mysql from 'mysql2/promise';
import FinancialAidProgramme from './FinancialAidProgramme';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';
import { FinancialAidProgrammeData } from '../types/types';

export interface FinancialAidProgrammesSearchParams {
    id?: number;
    searchText?: string;
}

export default class FinancialAidProgrammeRepository extends BaseRepository<FinancialAidProgramme> {
    constructor() {
        super('FinancialAidProgrammes');
    }

    protected mapRowToModel(row: any): FinancialAidProgramme {
        return new FinancialAidProgramme({
            id: row.Id,
            name: row.Name,
            alias: row.Alias,
            description: ToolsDb.sqlToString(row.Description),
            url: row.Url,
            gdFolderId: row.GdFolderId,
            _gdFolderUrl: ToolsDb.sqlToString(row._GdFolderUrl),
        });
    }

    async find(orConditions: FinancialAidProgrammesSearchParams[] = []) {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';

        const sql = `SELECT FinancialAidProgrammes.Id,
                FinancialAidProgrammes.Name,
                FinancialAidProgrammes.Alias,
                FinancialAidProgrammes.Description,
                FinancialAidProgrammes.Url,
                FinancialAidProgrammes.GdFolderId
            FROM FinancialAidProgrammes
            WHERE ${conditions}
            ORDER BY FinancialAidProgrammes.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
                `(FinancialAidProgrammes.Name LIKE ${mysql.escape(`%${word}%`)}
                    OR FinancialAidProgrammes.Description LIKE ${mysql.escape(
                        `%${word}%`
                    )}
                    OR FinancialAidProgrammes.Alias LIKE ${mysql.escape(
                        `%${word}%`
                    )}
                    )`
        );

        return conditions.join(' AND ');
    }

    private makeAndConditions(
        searchParams: FinancialAidProgrammesSearchParams
    ) {
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );

        return `${searchTextCondition}`;
    }
}
