import DocumentTemplate from './DocumentTemplate';
import BaseRepository from '../repositories/BaseRepository';

//nie wiem czy jest potrzebne
export interface DocumentTemplatesSearchParams {
    id?: number;
    name?: string;
}

export default class DocumentTemplateRepository extends BaseRepository<DocumentTemplate> {
    constructor() {
        super('DocumentTemplates');
    }

    protected mapRowToModel(row: any): DocumentTemplate {
        return new DocumentTemplate({
            id: row.Id,
            name: row.Name,
            description: row.Description,
            gdId: row.GdId,
            _contents: {
                id: row.ContentsId,
                gdId: row.ContentsGdId,
                alias: row.ContentsAlias,
                caseTypeId: row.ContentsCaseTypeId,
            },
        });
    }

    async find(
        orConditions: DocumentTemplatesSearchParams[] = []
    ): Promise<DocumentTemplate[]> {
        const sql = `SELECT  DocumentTemplates.Id,
                DocumentTemplates.Name,
                DocumentTemplates.Description,
                DocumentTemplates.GdId,
                DocumentTemplatesContents.Id AS ContentsId,
                DocumentTemplatesContents.GdId AS ContentsGdId,
                DocumentTemplatesContents.Alias AS ContentsAlias,
                DocumentTemplatesContents.CaseTypeId AS ContentsCaseTypeId
            FROM DocumentTemplates
            JOIN DocumentTemplatesContents ON DocumentTemplates.Id = DocumentTemplatesContents.TemplateId`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }
}
