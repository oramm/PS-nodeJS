import ToolsDb from '../../tools/ToolsDb';

export interface TaskHoursPayload {
    estimatedHours?: number | null;
    hoursMon?: number | null;
    hoursTue?: number | null;
    hoursWed?: number | null;
    hoursThu?: number | null;
    hoursFri?: number | null;
}

const HOURS_COLUMN_MAP: Record<keyof TaskHoursPayload, string> = {
    estimatedHours: 'EstimatedHours',
    hoursMon: 'HoursMon',
    hoursTue: 'HoursTue',
    hoursWed: 'HoursWed',
    hoursThu: 'HoursThu',
    hoursFri: 'HoursFri',
};

export interface TaskHoursResult extends TaskHoursPayload {
    id: number;
    weekSum: number;
}

/**
 * Repozytorium godzin scrumboardowych na tabeli Tasks
 * (szac. czas + godziny dzienne PON.-PT.). Aktualizuje tylko przekazane pola.
 * Godziny żyją wyłącznie w aplikacji — bez synchronizacji z arkuszem.
 */
export default class ScrumboardTaskHoursRepository {
    async updateHours(
        taskId: number,
        payload: TaskHoursPayload
    ): Promise<TaskHoursResult> {
        const setClauses: string[] = [];
        const params: any[] = [];
        for (const key of Object.keys(HOURS_COLUMN_MAP) as (keyof TaskHoursPayload)[]) {
            if (payload[key] !== undefined) {
                setClauses.push(`${HOURS_COLUMN_MAP[key]} = ?`);
                params.push(payload[key]);
            }
        }
        if (setClauses.length) {
            params.push(taskId);
            await ToolsDb.getQueryCallbackAsync(
                `UPDATE Tasks SET ${setClauses.join(', ')} WHERE Id = ?`,
                undefined,
                params
            );
        }
        return this.getHours(taskId);
    }

    async getHours(taskId: number): Promise<TaskHoursResult> {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, EstimatedHours, HoursMon, HoursTue, HoursWed, HoursThu, HoursFri
                FROM Tasks WHERE Id = ?`,
            undefined,
            [taskId]
        )) as any[];
        const row = rows[0];
        if (!row) throw new Error(`Nie znaleziono zadania o id ${taskId}`);
        const num = (v: any): number | null =>
            v === null || v === undefined ? null : Number(v);
        const days = [
            num(row.HoursMon),
            num(row.HoursTue),
            num(row.HoursWed),
            num(row.HoursThu),
            num(row.HoursFri),
        ];
        return {
            id: row.Id,
            estimatedHours: num(row.EstimatedHours),
            hoursMon: days[0],
            hoursTue: days[1],
            hoursWed: days[2],
            hoursThu: days[3],
            hoursFri: days[4],
            weekSum: days.reduce((sum: number, h) => sum + (h ?? 0), 0),
        };
    }

    /** Zeruje godziny dzienne (bieżący tydzień) wszystkich zadań. */
    async resetAllDailyHours(): Promise<void> {
        await ToolsDb.getQueryCallbackAsync(
            `UPDATE Tasks SET HoursMon = NULL, HoursTue = NULL, HoursWed = NULL,
                HoursThu = NULL, HoursFri = NULL`
        );
    }
}
