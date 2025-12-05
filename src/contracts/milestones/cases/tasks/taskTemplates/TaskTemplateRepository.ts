import BaseRepository from '../../../../../repositories/BaseRepository';
import ToolsDb from '../../../../../tools/ToolsDb';
import TaskTemplate from './TaskTemplate';

export type TaskTemplatesSearchParams = {
    taskTemplateId?: number;
    caseTemplateId?: number;
    caseTypeId?: number;
};

export default class TaskTemplateRepository extends BaseRepository<TaskTemplate> {
    constructor() {
        super('TaskTemplates');
    }

    /**
     * Wyszukuje szablony zadań według parametrów
     * Repository Layer - zawiera TYLKO logikę SQL i mapowanie
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<TaskTemplate[]>
     */
    async find(
        searchParams: TaskTemplatesSearchParams = {}
    ): Promise<TaskTemplate[]> {
        const taskTemplateCondition = searchParams.taskTemplateId
            ? `TaskTemplates.Id = ${searchParams.taskTemplateId}`
            : '1';
        const caseTemplateCondition = searchParams.caseTemplateId
            ? `TaskTemplates.CaseTemplateId = ${searchParams.caseTemplateId}`
            : '1';
        const caseTypeCondition = searchParams.caseTypeId
            ? `CaseTemplates.CaseTypeId = ${searchParams.caseTypeId}`
            : '1';

        const sql = `SELECT TaskTemplates.Id,
                TaskTemplates.Name,
                TaskTemplates.Description,
                TaskTemplates.DeadlineRule,
                TaskTemplates.CaseTemplateId,
                TaskTemplates.Status,
                CaseTemplates.CaseTypeId
            FROM TaskTemplates 
            JOIN CaseTemplates ON CaseTemplates.Id=TaskTemplates.CaseTemplateId
            JOIN CaseTypes ON CaseTypes.Id=CaseTemplates.CaseTypeId
            WHERE ${taskTemplateCondition} 
                AND ${caseTemplateCondition} 
                AND ${caseTypeCondition}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    protected mapRowToModel(row: any): TaskTemplate {
        return new TaskTemplate({
            id: row.Id,
            name: row.Name,
            description: row.Description,
            deadlineRule: row.DeadlineRule,
            status: row.Status,
            _caseTemplate: {
                id: row.CaseTemplateId,
                _caseType: {
                    id: row.CaseTypeId,
                },
            },
        });
    }
}
