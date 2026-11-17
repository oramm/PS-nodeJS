import Guard from '../../contracts/milestones/consolidation/ConsolidationWriteGuardController';
import ScrumboardTaskHoursRepository, {
    TaskHoursPayload,
    TaskHoursResult,
} from './ScrumboardTaskHoursRepository';

/**
 * Kontroler godzin scrumboardowych (szac. czas + godziny dzienne).
 * Prosty przypadek — operacja tylko na DB, bez Google API i bez sync z arkuszem.
 */
export default class ScrumboardTaskHoursController {
    private static repository = new ScrumboardTaskHoursRepository();

    static async updateHours(
        taskId: number,
        payload: TaskHoursPayload
    ): Promise<TaskHoursResult> {
        return Guard.taskHours(taskId, conn => this.repository.updateHours(taskId, payload, conn));
    }

    static async resetAllDailyHours(): Promise<void> {
        return Guard.allTaskHours(conn => this.repository.resetAllDailyHours(conn));
    }
}
