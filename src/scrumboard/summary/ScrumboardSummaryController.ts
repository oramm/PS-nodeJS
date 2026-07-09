import ToolsDb from '../../tools/ToolsDb';
import Setup from '../../setup/Setup';
import { getScrumboardPersons } from '../ScrumboardPersons';
import ScrumboardPlanningController from '../planning/ScrumboardPlanningController';

export interface ScrumboardPersonSummary {
    personId: number;
    personName: string;
    personAlias: string;
    available: number;
    assigned: number;
    mon: number;
    tue: number;
    wed: number;
    thu: number;
    fri: number;
    meetings: number;
    total: number;
    remaining: number;
}

type TaskHoursRow = {
    OwnerId: number;
    Status: string;
    EstimatedHours: number | string | null;
    HoursMon: number | string | null;
    HoursTue: number | string | null;
    HoursWed: number | string | null;
    HoursThu: number | string | null;
    HoursFri: number | string | null;
};

/**
 * Podsumowanie godzin — serwerowy odpowiednik tabeli "Times summary" z arkusza.
 * Semantyka 1:1 z formułami CurrentSprint.makeTimesSummary / personTimePerTaskFormula.
 */
export default class ScrumboardSummaryController {
    private static num(value: number | string | null): number {
        return value === null || value === undefined ? 0 : Number(value);
    }

    static async getSummary(): Promise<ScrumboardPersonSummary[]> {
        const persons = await getScrumboardPersons();
        if (persons.length === 0) return [];

        const personIds = persons.map((p) => p.id as number);
        const planningEntries =
            await ScrumboardPlanningController.getForScrumboardPersons();
        const planningByPersonId = new Map(
            planningEntries.map((entry) => [entry.personId, entry])
        );

        // Zadania scrumboardowe (nie-Backlog) osób z podsumowania,
        // z pominięciem zadań z kontraktów zakończonych/archiwalnych
        const placeholders = personIds.map(() => '?').join(', ');
        const rows: TaskHoursRow[] = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Tasks.OwnerId, Tasks.Status, Tasks.EstimatedHours,
                    Tasks.HoursMon, Tasks.HoursTue, Tasks.HoursWed, Tasks.HoursThu, Tasks.HoursFri
                FROM Tasks
                JOIN Cases ON Cases.Id = Tasks.CaseId
                JOIN Milestones ON Milestones.Id = Cases.MilestoneId
                JOIN Contracts ON Contracts.Id = Milestones.ContractId
                WHERE Tasks.OwnerId IN (${placeholders})
                    AND Tasks.Status <> ?
                    AND Contracts.Status NOT IN (?, ?)`,
            undefined,
            [
                ...personIds,
                Setup.TaskStatus.BACKLOG,
                Setup.ContractStatus.FINISHED,
                Setup.ContractStatus.ARCHIVAL,
            ]
        )) as any[];

        const reportedOnlyStatuses = new Set([
            Setup.TaskStatus.DONE,
            Setup.TaskStatus.AWAITING_RESPONSE,
        ]);

        const perPerson = new Map<
            number,
            { assigned: number; days: [number, number, number, number, number] }
        >();
        for (const id of personIds)
            perPerson.set(id, { assigned: 0, days: [0, 0, 0, 0, 0] });

        for (const row of rows) {
            const acc = perPerson.get(row.OwnerId);
            if (!acc) continue;
            const days: [number, number, number, number, number] = [
                this.num(row.HoursMon),
                this.num(row.HoursTue),
                this.num(row.HoursWed),
                this.num(row.HoursThu),
                this.num(row.HoursFri),
            ];
            const weekReported = days.reduce((s, h) => s + h, 0);
            const estimated = this.num(row.EstimatedHours);
            const assignedContribution = reportedOnlyStatuses.has(row.Status)
                ? weekReported
                : Math.max(estimated, weekReported);
            acc.assigned += assignedContribution;
            for (let i = 0; i < 5; i++) acc.days[i] += days[i];
        }

        return persons.map((person) => {
            const id = person.id as number;
            const acc = perPerson.get(id)!;
            const planning = planningByPersonId.get(id);
            const meetings = planning
                ? planning.planningMeetingHours +
                  planning.retroMeetingHours +
                  planning.extraMeetingsHours
                : 0;
            const available = planning ? planning._hoursAvailable : 0;
            const worked = acc.days.reduce((s, h) => s + h, 0);
            const total = worked + meetings;
            const remaining = available - worked;
            return {
                personId: id,
                personName: `${person.name ?? ''} ${person.surname ?? ''}`.trim(),
                personAlias: person._alias,
                available,
                assigned: acc.assigned,
                mon: acc.days[0],
                tue: acc.days[1],
                wed: acc.days[2],
                thu: acc.days[3],
                fri: acc.days[4],
                meetings,
                total,
                remaining,
            };
        });
    }
}
