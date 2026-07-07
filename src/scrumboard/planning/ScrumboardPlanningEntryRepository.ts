import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';
import ScrumboardPlanningEntry from './ScrumboardPlanningEntry';

/** Repozytorium wpisów planowania (dostępność tygodniowa osób). PersonId jest unikalny → UPSERT. */
export default class ScrumboardPlanningEntryRepository extends BaseRepository<ScrumboardPlanningEntry> {
    constructor() {
        super('ScrumboardPlanningEntries');
    }

    protected mapRowToModel(row: any): ScrumboardPlanningEntry {
        return new ScrumboardPlanningEntry({
            id: row.Id,
            personId: row.PersonId,
            workingDays: row.WorkingDays,
            hoursPerDay: row.HoursPerDay,
            planningMeetingHours: row.PlanningMeetingHours,
            retroMeetingHours: row.RetroMeetingHours,
            extraMeetingsHours: row.ExtraMeetingsHours,
        });
    }

    async find(): Promise<ScrumboardPlanningEntry[]> {
        const sql = `SELECT Id, PersonId, WorkingDays, HoursPerDay,
                PlanningMeetingHours, RetroMeetingHours, ExtraMeetingsHours
            FROM ScrumboardPlanningEntries`;
        const rows = await ToolsDb.getQueryCallbackAsync(sql);
        return (Array.isArray(rows) ? rows : []).map((row) =>
            this.mapRowToModel(row)
        );
    }

    /** Ustawia wpis planowania dla osoby (UPSERT). */
    async upsert(
        personId: number,
        values: {
            workingDays: number;
            hoursPerDay: number;
            planningMeetingHours: number;
            retroMeetingHours: number;
            extraMeetingsHours: number;
        }
    ): Promise<ScrumboardPlanningEntry> {
        const sql = `INSERT INTO ScrumboardPlanningEntries
                (PersonId, WorkingDays, HoursPerDay, PlanningMeetingHours,
                 RetroMeetingHours, ExtraMeetingsHours)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                WorkingDays = VALUES(WorkingDays),
                HoursPerDay = VALUES(HoursPerDay),
                PlanningMeetingHours = VALUES(PlanningMeetingHours),
                RetroMeetingHours = VALUES(RetroMeetingHours),
                ExtraMeetingsHours = VALUES(ExtraMeetingsHours)`;
        await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            personId,
            values.workingDays,
            values.hoursPerDay,
            values.planningMeetingHours,
            values.retroMeetingHours,
            values.extraMeetingsHours,
        ]);
        return new ScrumboardPlanningEntry({ personId, ...values });
    }
}
