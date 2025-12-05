import BaseRepository from '../../../../../repositories/BaseRepository';
import ToolsDb from '../../../../../tools/ToolsDb';
import TaskTemplateForProcess from './TaskTemplateForProcess';

export type TaskTemplatesForProcessesSearchParams = {
    processId?: number;
    taskTemplateId?: number;
};

export default class TaskTemplateForProcessRepository extends BaseRepository<TaskTemplateForProcess> {
    constructor() {
        super('TaskTemplatesForProcesses');
    }

    /**
     * Wyszukuje szablony zadań dla procesów według parametrów
     * Repository Layer - zawiera TYLKO logikę SQL i mapowanie
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<TaskTemplateForProcess[]>
     */
    async find(
        searchParams: TaskTemplatesForProcessesSearchParams = {}
    ): Promise<TaskTemplateForProcess[]> {
        const processCondition = searchParams.processId
            ? `TaskTemplatesForProcesses.ProcessId = ${searchParams.processId}`
            : '1';
        const taskTemplateCondition = searchParams.taskTemplateId
            ? `TaskTemplatesForProcesses.TaskTemplateId = ${searchParams.taskTemplateId}`
            : '1';

        const sql = `SELECT TaskTemplatesForProcesses.Id,
                TaskTemplatesForProcesses.Name,
                TaskTemplatesForProcesses.Description,
                TaskTemplatesForProcesses.CaseTypeId,
                TaskTemplatesForProcesses.ProcessId,
                TaskTemplatesForProcesses.DeadlineRule
            FROM TaskTemplatesForProcesses
            WHERE ${processCondition} 
                AND ${taskTemplateCondition}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    protected mapRowToModel(row: any): TaskTemplateForProcess {
        return new TaskTemplateForProcess({
            id: row.Id,
            name: row.Name,
            description: row.Description,
            deadlineRule: row.DeadlineRule,
            _caseType: {
                id: row.CaseTypeId,
            },
            _process: {
                id: row.ProcessId,
            },
        });
    }
}
