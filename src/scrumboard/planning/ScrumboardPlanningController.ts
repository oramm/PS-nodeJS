import BaseController from '../../controllers/BaseController';
import { getScrumboardPersons } from '../ScrumboardPersons';
import ScrumboardPlanningEntry, {
    PLANNING_DEFAULTS,
} from './ScrumboardPlanningEntry';
import ScrumboardPlanningEntryRepository from './ScrumboardPlanningEntryRepository';

/** Kontroler planowania (odpowiednik arkusza "planowanie"). */
export default class ScrumboardPlanningController extends BaseController<
    ScrumboardPlanningEntry,
    ScrumboardPlanningEntryRepository
> {
    private static instance: ScrumboardPlanningController;

    constructor() {
        super(new ScrumboardPlanningEntryRepository());
    }

    private static getInstance(): ScrumboardPlanningController {
        if (!this.instance) this.instance = new ScrumboardPlanningController();
        return this.instance;
    }

    /**
     * Zwraca wpisy planowania dla wszystkich osób scrumboarda.
     * Osoby bez wpisu w bazie dostają wartości domyślne (nie zapisywane dopóki nie edytowane).
     */
    static async getForScrumboardPersons(): Promise<ScrumboardPlanningEntry[]> {
        const [persons, entries] = await Promise.all([
            getScrumboardPersons(),
            this.getInstance().repository.find(),
        ]);
        const entriesByPersonId = new Map(
            entries.map((entry) => [entry.personId, entry])
        );

        return persons.map((person) => {
            const existing = entriesByPersonId.get(person.id as number);
            const base =
                existing ??
                new ScrumboardPlanningEntry({
                    personId: person.id as number,
                    ...PLANNING_DEFAULTS,
                });
            base._person = {
                id: person.id as number,
                name: person.name,
                surname: person.surname,
                _alias: person._alias,
            };
            return base;
        });
    }

    static async upsert(
        personId: number,
        values: {
            workingDays: number;
            hoursPerDay: number;
            planningMeetingHours: number;
            retroMeetingHours: number;
            extraMeetingsHours: number;
        }
    ): Promise<ScrumboardPlanningEntry> {
        return this.getInstance().repository.upsert(personId, values);
    }
}
