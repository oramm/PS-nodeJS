

import ToolsDb from "../../../../../tools/ToolsDb";
import TaskTemplate from "./TaskTemplate";

export default class TaskTemplatesController {
    static async getTaskTemplatesList(initParamObject: any) {
        const taskTemplateConditon = (initParamObject && initParamObject.taskTemplateId) ? 'TaskTemplates.TaskTemplateId=' + initParamObject.taskTemplateId : '1';
        const caseTemplateConditon = (initParamObject && initParamObject.caseTemplateId) ? 'TaskTemplates.CaseTemplateId=' + initParamObject.caseTemplateId : '1';
        const caseTypeConditon = (initParamObject && initParamObject.caseTypeId) ? 'CaseTemplates.CaseTypeId=' + initParamObject.caseTypeId : '1';

        const sql = `SELECT  TaskTemplates.Id,
                TaskTemplates.Name,
                TaskTemplates.Description,
                TaskTemplates.DeadlineRule,
                TaskTemplates.CaseTemplateId,
                TaskTemplates.Status,
                CaseTemplates.CaseTypeId
        FROM TaskTemplates 
        JOIN CaseTemplates ON CaseTemplates.Id=TaskTemplates.CaseTemplateId
        JOIN CaseTypes ON CaseTypes.Id=CaseTemplates.CaseTypeId
        WHERE ${taskTemplateConditon} AND ${caseTemplateConditon}  AND ${caseTypeConditon}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processTaskTemplatesResult(result);
    }

    static processTaskTemplatesResult(result: any[]): [TaskTemplate?] {
        let newResult: [TaskTemplate?] = [];

        for (const row of result) {
            const item = new TaskTemplate({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                deadlineRule: row.DeadlineRule,
                status: row.Status,
                _caseTemplate: {
                    id: row.CaseTemplateId,
                    _caseType: {
                        id: row.CaseTypeId
                    }
                }
            });
            newResult.push(item);
        }
        return newResult;
    }
}