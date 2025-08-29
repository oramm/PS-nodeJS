import DocumentTemplate from "../documentTemplates/DocumentTemplate";
import BaseRepository from "../repositories/BaseRepository";
import ProcessStep from "./ProcessStep";

export default class ProcessStepRepository extends BaseRepository<ProcessStep>{
    constructor(){
        super('ProcessesSteps');
    }

    protected mapRowToEntity(row: any): ProcessStep {
        return new ProcessStep({
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
    }

    async find(initParamObject: any): Promise<ProcessStep[]> {
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

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToEntity(row));
    }
}