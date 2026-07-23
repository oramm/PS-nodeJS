import BaseRepository from '../../../../repositories/BaseRepository';
import ToolsDb from '../../../../tools/ToolsDb';

export interface CaseTypeFolderRow {
    milestoneId: number;
    caseTypeId: number;
    gdFolderId: string;
}

/**
 * Cache ID folderu GD typu sprawy per kamień milowy (tabela CaseTypeFolders).
 * UPSERT przez INSERT ... ON DUPLICATE KEY UPDATE - (MilestoneId, CaseTypeId) to PK.
 */
export default class CaseTypeFolderRepository extends BaseRepository<CaseTypeFolderRow> {
    constructor() {
        super('CaseTypeFolders');
    }

    async upsert(
        milestoneId: number,
        caseTypeId: number,
        gdFolderId: string
    ): Promise<void> {
        await ToolsDb.getQueryCallbackAsync(
            `INSERT INTO CaseTypeFolders (MilestoneId, CaseTypeId, GdFolderId)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE GdFolderId = VALUES(GdFolderId)`,
            undefined,
            [milestoneId, caseTypeId, gdFolderId]
        );
    }

    /** Nieużywane - ten Repository służy tylko do upsertu z backfillu i CasesController. */
    async find(): Promise<CaseTypeFolderRow[]> {
        throw new Error('CaseTypeFolderRepository.find() nie jest zaimplementowane - użyj upsert()');
    }

    protected mapRowToModel(row: any): CaseTypeFolderRow {
        return {
            milestoneId: row.MilestoneId,
            caseTypeId: row.CaseTypeId,
            gdFolderId: row.GdFolderId,
        };
    }
}
