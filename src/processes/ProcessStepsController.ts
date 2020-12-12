import mysql from "mysql";
import DocumentTemplate from "../documentTemplates/DocumentTemplate";
import Tools from "../tools/Tools";
import ToolsDb from '../tools/ToolsDb'
import ProcessStep from "./ProcessStep";

export default class ProcessStepsController {
    static async getProcessStepsList(initParamObject: any) {
        const processcondition = (initParamObject && initParamObject.processId) ? 'ProcessesSteps.ProcessId=' + initParamObject.processId: '1'

        const sql = 'SELECT  ProcessesSteps.Id, \n \t' +
            'ProcessesSteps.Name, \n \t' +
            'ProcessesSteps.Description, \n \t' +
            'ProcessesSteps.LastUpdated, \n \t' +
            'Processes.Id AS ProcessId, \n \t' +
            'Processes.Name AS ProcessName, \n \t' +
            'Processes.CaseTypeId AS ProcessCaseTypeId, \n \t' +
            'DocumentTemplates.Id AS DocumentTemplateId, \n \t' +
            'DocumentTemplates.Name AS DocumentTemplateName, \n \t' +
            'DocumentTemplates.Description AS DocumentTemplateDescription, \n \t' +
            'DocumentTemplates.GdId AS DocumentTemplateGdId, \n \t' +
            'DocumentTemplatesContents.GdId AS ContentsGdId, \n \t' +
            'DocumentTemplatesContents.Alias AS ContentsAlias, \n \t' +
            'DocumentTemplatesContents.CaseTypeId AS ContentsCaseTypeId \n' +
            'FROM ProcessesSteps \n' +
            'JOIN Processes ON Processes.Id=ProcessesSteps.ProcessId \n' +
            'LEFT JOIN DocumentTemplatesContents ON DocumentTemplatesContents.Id = ProcessesSteps.DocumentTemplateContentsId \n' +
            'LEFT JOIN DocumentTemplates ON DocumentTemplates.Id=DocumentTemplatesContents.TemplateId \n' +
            'WHERE ' + processcondition;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processProcessStepsResult(result);


    }

    static processProcessStepsResult(result: any[]): [ProcessStep?] {
        let newResult: [ProcessStep?] = [];

        for (const row of result) {
            var item = new ProcessStep({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                _documentTemplate: new DocumentTemplate({
                  name: row.DocumentTemplateName,
                  description: row.DocumentTemplateDescription,
                  gdId: row.DocumentTemplateGdId,
                  _contents: {
                    gdId: row.ContentsGdId,
                    alias: row.ContentsAlias,
                    caseTypeId: row.ContentsCaseTypeId
                  }
                }),
                documentTemplateId: row.DocumentTemplateId,
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