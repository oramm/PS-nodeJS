import BaseRepository from "../repositories/BaseRepository";
import Process from "./Process";

export default class ProcessRepository extends BaseRepository<Process>{
    constructor(){
        super('Processes');
    }

    protected mapRowToEntity(row: any): Process{
        return new Process({
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
    }
    async find(initParamObject: any): Promise<Process[]> {
        const statusCondition = (initParamObject && initParamObject.status) ? 'Processes.Status="' + initParamObject.status + '"' : '1';

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
            'WHERE ' + statusCondition;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToEntity(row));
    }
}