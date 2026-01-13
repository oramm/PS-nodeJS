import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';
import ProcessInstance from './ProcessInstance';

export default class ProcessInstanceRepository extends BaseRepository<ProcessInstance> {
    constructor() {
        super('ProcessInstances');
    }

    protected mapRowToModel(row: any): ProcessInstance {
        return new ProcessInstance({
            id: row.Id,
            _case: {
                id: row.CaseId,
            },
            _task: {
                id: row.TaskId,
            },
            editorId: row.EditorId,
            _lastUpdated: row.LastUpdated,
            _process: {
                id: row.ProcessId,
                name: ToolsDb.sqlToString(row.ProcessName),
                description: ToolsDb.sqlToString(row.ProcessDescription),
            },
        });
    }

    async find(initParamObject: any): Promise<ProcessInstance[]> {
        const projectConditon =
            initParamObject && initParamObject.projectId
                ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"'
                : '1';
        const contractConditon =
            initParamObject && initParamObject.contractId
                ? 'Contracts.Id="' + initParamObject.contractId + '"'
                : '1';
        const milestoneConditon =
            initParamObject && initParamObject.milestoneId
                ? 'Milestones.Id="' + initParamObject.milestoneId + '"'
                : '1';
        const sql =
            'SELECT  ProcessInstances.Id, \n \t' +
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
            'WHERE ' +
            milestoneConditon +
            ' AND ' +
            contractConditon +
            ' AND ' +
            projectConditon;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }
}
