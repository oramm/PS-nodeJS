export interface ScrumboardPlanningEntryData {
    id?: number;
    personId: number;
    workingDays: number;
    hoursPerDay: number;
    planningMeetingHours: number;
    retroMeetingHours: number;
    extraMeetingsHours: number;
    /** wyliczane: WorkingDays*HoursPerDay − (Planning+Retro+Extra) */
    _hoursAvailable?: number;
    _person?: { id: number; name?: string; surname?: string; _alias?: string };
}

/** Odpowiednik wiersza arkusza "planowanie" — dostępność tygodniowa osoby. */
export default class ScrumboardPlanningEntry
    implements ScrumboardPlanningEntryData
{
    id?: number;
    personId: number;
    workingDays: number;
    hoursPerDay: number;
    planningMeetingHours: number;
    retroMeetingHours: number;
    extraMeetingsHours: number;
    _hoursAvailable: number;
    _person?: { id: number; name?: string; surname?: string; _alias?: string };

    constructor(data: ScrumboardPlanningEntryData) {
        this.id = data.id;
        this.personId = data.personId;
        this.workingDays = Number(data.workingDays);
        this.hoursPerDay = Number(data.hoursPerDay);
        this.planningMeetingHours = Number(data.planningMeetingHours);
        this.retroMeetingHours = Number(data.retroMeetingHours);
        this.extraMeetingsHours = Number(data.extraMeetingsHours);
        this._person = data._person;
        this._hoursAvailable =
            this.workingDays * this.hoursPerDay -
            (this.planningMeetingHours +
                this.retroMeetingHours +
                this.extraMeetingsHours);
    }
}

/** Domyślne wartości wiersza planowania (jak w arkuszu: 5 dni, 8h, spotkania 2/1.5/0). */
export const PLANNING_DEFAULTS = {
    workingDays: 5,
    hoursPerDay: 8,
    planningMeetingHours: 2,
    retroMeetingHours: 0,
    extraMeetingsHours: 0,
};
