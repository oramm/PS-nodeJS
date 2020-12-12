import mysql from "mysql";
import Tools from "../tools/Tools";
import ToolsDb from '../tools/ToolsDb'
import DocumentTemplate from "./DocumentTemplate";

export default class DocumentTemplatesController {
    static async getDocumentTemplatesList(initParamObject: any) {
        const sql = 'SELECT  DocumentTemplates.Id, \n \t' +
            'DocumentTemplates.Name, \n \t' +
            'DocumentTemplates.Description, \n \t' +
            'DocumentTemplates.GdId \n \t, ' +
            'DocumentTemplatesContents.GdId AS ContentsGdId, \n \t' +
            'DocumentTemplatesContents.Alias AS ContentsAlias, \n \t' +
            'DocumentTemplatesContents.CaseTypeId AS ContentsCaseTypeId \n' +
            'FROM DocumentTemplates \n' +
            'JOIN DocumentTemplatesContents ON DocumentTemplates.Id = DocumentTemplatesContents.TemplateId';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processDocumentTemplatesResult(result);
    }

    static processDocumentTemplatesResult(result: any[]): [DocumentTemplate?] {
        let newResult: [DocumentTemplate?] = [];

        for (const row of result) {
            var item = new DocumentTemplate({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                gdId: row.GdId,
                _contents: {
                    gdId: row.ContentsGdId,
                    alias: row.ContentsAlias,
                    caseTypeId: row.ContentsCaseTypeId
                },
            });
            newResult.push(item);
        }
        return newResult;
    }
}