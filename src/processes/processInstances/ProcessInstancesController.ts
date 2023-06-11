import mysql from 'mysql2/promise';
import ToolsDb from "../../tools/ToolsDb";
import ProcessInstance from "./ProcessInstance";

export default class ProcessInstancesController {
    static async getProcessInstancesList(initParamObject: any) {
        const projectConditon = (initParamObject && initParamObject.projectId) ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        const contractConditon = (initParamObject && initParamObject.contractId) ? 'Contracts.Id="' + initParamObject.contractId + '"' : '1';
        const milestoneConditon = (initParamObject && initParamObject.milestoneId) ? 'Milestones.Id="' + initParamObject.milestoneId + '"' : '1';
        const sql = 'SELECT  ProcessInstances.Id, \n \t' +
            'ProcessInstances.CaseId, \n \t' +
            'ProcessInstances.TaskId, \n \t' +
            'ProcessInstances.EditorId, \n \t' +
            'ProcessInstances.LastUpdated, \n \t' +
            'Processes.Id AS ProcessId, \n \t' +
            'Processes.Name AS ProcessName, \n \t' +
            'Processes.Description  AS ProcessDescription \n' +
            'FROM ProcessInstances \n' +
            'JOIN Processes ON ProcessInstances.ProcessId = Processes.Id \n' +
            'JOIN Cases ON Cases.Id = ProcessInstances.CaseId \n' +
            'JOIN Milestones ON Milestones.Id = Cases.MilestoneId \n' +
            'JOIN Contracts ON Milestones.ContractId = Contracts.Id \n' +
            'WHERE ' + milestoneConditon + ' AND ' + contractConditon + ' AND ' + projectConditon;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processProcessInstancesResult(result);


    }

    static processProcessInstancesResult(result: any[]): [ProcessInstance?] {
        let newResult: [ProcessInstance?] = [];

        for (const row of result) {
            var item = new ProcessInstance({
                id: row.Id,
                _case: {
                    id: row.CaseId
                },
                _task: {
                    id: row.TaskId
                },
                _editor: {
                    id: row.EditorId
                },
                _lastUpdated: row.LastUpdated,
                _process: {
                    id: row.ProcessId,
                    name: ToolsDb.stringToSql(row.ProcessName),
                    description: row.ProcessDescription,
                }
            });
            newResult.push(item);
        }
        return newResult;
    }
}