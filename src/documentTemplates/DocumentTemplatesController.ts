import ToolsDb from '../tools/ToolsDb';
import { DocumentTemplateData } from '../types/types';
import DocumentTemplate from './DocumentTemplate';

export default class DocumentTemplatesController {
    static async getDocumentTemplatesList(initParamObject: any) {
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

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processDocumentTemplatesResult(result);
    }

    static processDocumentTemplatesResult(
        result: any[]
    ): DocumentTemplateData[] {
        let newResult: DocumentTemplateData[] = [];

        for (const row of result) {
            const item: DocumentTemplateData = {
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
            };
            newResult.push(item);
        }
        return newResult;
    }
}
