import ToolsDb from '../../tools/ToolsDb';
import Setup from '../../setup/Setup';
import { milestoneVisibilitySql } from '../../contracts/milestones/sharing/milestoneVisibilitySql';

export interface TaskHoursRow {
    OwnerId: number;
    Status: string;
    EstimatedHours: number | string | null;
    HoursMon: number | string | null;
    HoursTue: number | string | null;
    HoursWed: number | string | null;
    HoursThu: number | string | null;
    HoursFri: number | string | null;
}

export default class ScrumboardSummaryRepository {
    async findTaskHours(personIds: number[]): Promise<TaskHoursRow[]> {
        if (!personIds.length) return [];
        const visible = milestoneVisibilitySql({
            excludedStatuses: [
                Setup.ContractStatus.FINISHED,
                Setup.ContractStatus.ARCHIVAL,
            ],
        });
        return (await ToolsDb.getQueryCallbackAsync(
            `SELECT Tasks.OwnerId, Tasks.Status, Tasks.EstimatedHours,
                    Tasks.HoursMon, Tasks.HoursTue, Tasks.HoursWed, Tasks.HoursThu, Tasks.HoursFri
                FROM Tasks
                JOIN Cases ON Cases.Id = Tasks.CaseId
                JOIN Milestones ON Milestones.Id = Cases.MilestoneId
                WHERE Tasks.OwnerId IN (${personIds.map(() => '?').join(', ')})
                    AND Tasks.Status <> ?
                    AND ${visible}`,
            undefined,
            [...personIds, Setup.TaskStatus.BACKLOG]
        )) as TaskHoursRow[];
    }
}
