import mysql from "mysql";
import DocumentTemplate from "../documentTemplates/DocumentTemplate";
import Tools from "../tools/Tools";
import ToolsDb from '../tools/ToolsDb'
import ProcessStep from "./ProcessStep";

export default class ProcessStepsController {
    static async getProcessStepsList(initParamObject: any) {
        const processcondition = (initParamObject && initParamObject.processId) ? 'ProcessesSteps.ProcessId=' + initParamObject.processId : '1'

        const sql = `SELECT  ProcessesSteps.Id,
            ProcessesSteps.Name,
            ProcessesSteps.Description,
            ProcessesSteps.LastUpdated,
            Processes.Id AS ProcessId,
            Processes.Name AS ProcessName,
            Processes.CaseTypeId AS ProcessCaseTypeId,
            DocumentTemplates.Id AS DocumentTemplateId,
            DocumentTemplates.Name AS DocumentTemplateName,
            DocumentTemplates.Description AS DocumentTemplateDescription,
            DocumentTemplates.GdId AS DocumentTemplateGdId,
            DocumentTemplatesContents.Id AS ContentsId,
            DocumentTemplatesContents.GdId AS ContentsGdId,
            DocumentTemplatesContents.Alias AS ContentsAlias,
            DocumentTemplatesContents.CaseTypeId AS ContentsCaseTypeId
            FROM ProcessesSteps
            JOIN Processes ON Processes.Id=ProcessesSteps.ProcessId
            LEFT JOIN DocumentTemplatesContents ON DocumentTemplatesContents.Id = ProcessesSteps.DocumentTemplateContentsId
            LEFT JOIN DocumentTemplates ON DocumentTemplates.Id=DocumentTemplatesContents.TemplateId
            WHERE ${processcondition}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processProcessStepsResult(result);
    }

    static processProcessStepsResult(result: any[]): ProcessStep[] {
        let newResult: ProcessStep[] = [];

        for (const row of result) {
            var item = new ProcessStep({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                _documentTemplate: new DocumentTemplate({
                    id: row.DocumentTemplateId,
                    name: row.DocumentTemplateName,
                    description: row.DocumentTemplateDescription,
                    gdId: row.DocumentTemplateGdId,
                    _contents: {
                        id: row.ContentsId,
                        gdId: row.ContentsGdId,
                        alias: row.ContentsAlias,
                        caseTypeId: row.ContentsCaseTypeId
                    }
                }),
                _parent: {
                    id: row.ProcessId,
                    name: row.ProcessName,
                    caseTypeId: row.ProcessCaseTypeId,
                },
                _lastUpdated: row.LastUpdated
            });
            newResult.push(item);
        }
        return newResult;
    }
}