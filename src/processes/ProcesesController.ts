import mysql from 'mysql2/promise';
import Tools from "../tools/Tools";
import ToolsDb from '../tools/ToolsDb'
import Process from "./Process";

export default class ProcessesController {
    static async getProcessesList(initParamObject: any) {
        const statusConditon = (initParamObject && initParamObject.status) ? 'Processes.Status="' + initParamObject.status + '"' : '1';

        const sql = 'SELECT  Processes.Id, \n \t' +
            'Processes.Name, \n \t' +
            'Processes.Description, \n \t' +
            'Processes.Status, \n \t' +
            'Processes.LastUpdated, \n \t' +
            'Processes.EditorId, \n \t' +
            'Processes.CaseTypeId, \n \t' +
            'CaseTypes.Name As CaseTypeName, \n \t' +
            'CaseTypes.FolderNumber, \n \t' +
            'TaskTemplatesForProcesses.Id AS TaskTemplateId, \n \t' +
            'TaskTemplatesForProcesses.Name AS TaskTemplateName, \n \t' +
            'TaskTemplatesForProcesses.Description AS TaskTemplateDescription \n' +
            'FROM Processes \n' +
            'JOIN CaseTypes ON CaseTypes.Id=Processes.CaseTypeId \n' +
            'LEFT JOIN TaskTemplatesForProcesses ON TaskTemplatesForProcesses.ProcessId = Processes.Id \n' +
            'WHERE ' + statusConditon;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processProcessesResult(result);
    }

    static processProcessesResult(result: any[]): [Process?] {
        let newResult: [Process?] = [];

        for (const row of result) {
            var item = new Process({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                status: row.Status,
                _caseType: {
                    id: row.CaseTypeId,
                    name: row.CaseTypeName
                },
                _lastUpdated: row.LastUpdated,
                _editor: {
                    id: row.EditorId
                },
                _taskTemplate: {
                    id: row.TaskTemplateId,
                    name: row.TaskTemplateName,
                    description: row.TaskTemplateDescription
                }
            });
            newResult.push(item);
        }
        return newResult;
    }
}