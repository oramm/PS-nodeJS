

import ToolsDb from "../../../../../tools/ToolsDb";
import TasksTemplateForProcess from "./TaskTemplateForProcess";

export default class TasksTemplateForProcesssController {
    static async getTasksTemplateForProcesssList(initParamObject: any) {
        const processCondition = (initParamObject && initParamObject.processId) ? 'TaskTemplatesForProcesses.ProcessId=' + initParamObject.processId : '1';
        const taskTemplateConditon = (initParamObject && initParamObject.taskTemplateId) ? 'TaskTemplatesForProcesses.TaskTemplateId=' + initParamObject.taskTemplateId : '1';

        const sql = `SELECT  TaskTemplatesForProcesses.Id,
            TaskTemplatesForProcesses.Name,
            TaskTemplatesForProcesses.Description,
            TaskTemplatesForProcesses.CaseTypeId,
            TaskTemplatesForProcesses.ProcessId,
            TaskTemplatesForProcesses.DeadlineRule
            FROM TaskTemplatesForProcesses
            WHERE ${processCondition} AND ${taskTemplateConditon}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processTasksTemplateForProcesssResult(result);
    }

    static processTasksTemplateForProcesssResult(result: any[]): [TasksTemplateForProcess?] {
        let newResult: [TasksTemplateForProcess?] = [];

        for (const row of result) {
            const item = new TasksTemplateForProcess({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                deadlineRule: row.DeadlineRule,
                _caseType: {
                    id: row.CaseTypeId
                },
                _process: {
                    id: row.ProcessId
                }
            });
            newResult.push(item);
        }
        return newResult;
    }
}