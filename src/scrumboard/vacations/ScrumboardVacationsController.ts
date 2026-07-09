import BaseController from '../../controllers/BaseController';
import { getScrumboardPersons } from '../ScrumboardPersons';
import ScrumboardAbsence from './ScrumboardAbsence';
import ScrumboardAbsenceRepository from './ScrumboardAbsenceRepository';
import ScrumboardAbsenceTypeRepository from './ScrumboardAbsenceTypeRepository';
import ScrumboardVacationEntitlementRepository from './ScrumboardVacationEntitlementRepository';
import {
    countWeekdays,
    countWeekdaysInWindow,
    prevCurrentNextWeekWindows,
} from './vacationDateUtils';

export interface VacationPersonRow {
    personId: number;
    personName: string;
    personAlias: string;
    limitDays: number;
    carryoverDays: number;
    usedDays: number;
    remainingDays: number;
    absences: ScrumboardAbsence[];
}

export interface VacationsYearData {
    year: number;
    types: {
        id: number;
        name: string;
        color: string;
        countsAgainstLimit: boolean;
    }[];
    rows: VacationPersonRow[];
}

export interface VacationWeekCount {
    personId: number;
    prev: number;
    current: number;
    next: number;
}

/** Kontroler urlopów (następca zakładki "urlopy" z arkusza). */
export default class ScrumboardVacationsController extends BaseController<
    ScrumboardAbsence,
    ScrumboardAbsenceRepository
> {
    private static instance: ScrumboardVacationsController;
    private typeRepository = new ScrumboardAbsenceTypeRepository();
    private entitlementRepository =
        new ScrumboardVacationEntitlementRepository();

    constructor() {
        super(new ScrumboardAbsenceRepository());
    }

    private static getInstance(): ScrumboardVacationsController {
        if (!this.instance) this.instance = new ScrumboardVacationsController();
        return this.instance;
    }

    /** Dane całej zakładki dla danego roku: typy + wiersze osób z urlopami i saldem. */
    static async getYearData(year: number): Promise<VacationsYearData> {
        const instance = this.getInstance();
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;

        const persons = await getScrumboardPersons();
        const personIds = persons.map((p) => p.id as number);
        if (personIds.length === 0)
            return { year, types: [], rows: [] };

        const [types, absences, entitlements] = await Promise.all([
            instance.typeRepository.find(),
            instance.repository.find({
                rangeStart: yearStart,
                rangeEnd: yearEnd,
                personIds,
            }),
            instance.entitlementRepository.find(year),
        ]);

        const absencesByPerson = new Map<number, ScrumboardAbsence[]>();
        for (const id of personIds) absencesByPerson.set(id, []);
        for (const absence of absences)
            absencesByPerson.get(absence.personId)?.push(absence);

        const entitlementByPerson = new Map(
            entitlements.map((e) => [e.personId, e])
        );

        const rows: VacationPersonRow[] = persons.map((person) => {
            const id = person.id as number;
            const personAbsences = absencesByPerson.get(id) ?? [];
            // wykorzystane = dni robocze w danym roku z typów liczących do limitu
            // (dni weekendowe pomijane, bo countWeekdaysInWindow liczy tylko pon-pt)
            const usedDays = personAbsences
                .filter((a) => a._countsAgainstLimit)
                .reduce(
                    (sum, a) =>
                        sum +
                        countWeekdaysInWindow(
                            a.dateFrom,
                            a.dateTo,
                            yearStart,
                            yearEnd
                        ),
                    0
                );
            const entitlement = entitlementByPerson.get(id);
            const limitDays = entitlement?.limitDays ?? 0;
            const carryoverDays = entitlement?.carryoverDays ?? 0;
            return {
                personId: id,
                personName: `${person.name ?? ''} ${person.surname ?? ''}`.trim(),
                personAlias: person._alias,
                limitDays,
                carryoverDays,
                usedDays,
                remainingDays: limitDays + carryoverDays - usedDays,
                absences: personAbsences,
            };
        });

        return {
            year,
            types: types.map((t) => ({
                id: t.id,
                name: t.name,
                color: t.color,
                countsAgainstLimit: t.countsAgainstLimit,
            })),
            rows,
        };
    }

    /** Tworzy nieobecność. Zwraca zapisany rekord (z Id i policzonymi dniami). */
    static async addAbsence(
        values: {
            personId: number;
            typeId: number;
            dateFrom: string;
            dateTo: string;
            note: string | null;
        },
        createdByPersonId?: number
    ): Promise<ScrumboardAbsence> {
        const instance = this.getInstance();
        const absence = new ScrumboardAbsence({
            ...values,
            workingDaysCount: countWeekdays(values.dateFrom, values.dateTo),
            createdByPersonId: createdByPersonId ?? null,
        });
        const id = await instance.repository.insert(absence);
        return (await instance.repository.findById(id)) ?? absence;
    }

    /** Edytuje nieobecność (typ, zakres, notatka). */
    static async editAbsence(
        id: number,
        values: {
            typeId: number;
            dateFrom: string;
            dateTo: string;
            note: string | null;
        }
    ): Promise<ScrumboardAbsence> {
        const instance = this.getInstance();
        const existing = await instance.repository.findById(id);
        if (!existing) throw new Error(`Nie znaleziono urlopu o id ${id}`);
        const updated = new ScrumboardAbsence({
            ...existing,
            ...values,
            id,
            personId: existing.personId,
            workingDaysCount: countWeekdays(values.dateFrom, values.dateTo),
        });
        await instance.repository.update(updated);
        return (await instance.repository.findById(id)) ?? updated;
    }

    static async deleteAbsence(id: number): Promise<void> {
        await this.getInstance().repository.deleteById(id);
    }

    /** Ustawia roczny wymiar urlopu (bieżący + zaległy) dla osoby (UPSERT). */
    static async setLimit(
        personId: number,
        year: number,
        limitDays: number,
        carryoverDays: number
    ): Promise<{
        personId: number;
        year: number;
        limitDays: number;
        carryoverDays: number;
    }> {
        return this.getInstance().entitlementRepository.upsert(
            personId,
            year,
            limitDays,
            carryoverDays
        );
    }

    /**
     * Liczba dni urlopu (dni robocze, WSZYSTKIE typy - liczy się kto jest nieobecny)
     * w tygodniu poprzednim/bieżącym/następnym, per osoba scrumboardu.
     * Wyłącznie informacyjne dla zakładki Planowanie.
     */
    static async getWeekCounts(today = new Date()): Promise<VacationWeekCount[]> {
        const instance = this.getInstance();
        const persons = await getScrumboardPersons();
        const personIds = persons.map((p) => p.id as number);
        if (personIds.length === 0) return [];

        const windows = prevCurrentNextWeekWindows(today);
        const absences = await instance.repository.find({
            rangeStart: windows.prev[0],
            rangeEnd: windows.next[1],
            personIds,
        });

        const byPerson = new Map<number, VacationWeekCount>();
        for (const id of personIds)
            byPerson.set(id, { personId: id, prev: 0, current: 0, next: 0 });

        for (const absence of absences) {
            const counts = byPerson.get(absence.personId);
            if (!counts) continue;
            counts.prev += countWeekdaysInWindow(
                absence.dateFrom,
                absence.dateTo,
                windows.prev[0],
                windows.prev[1]
            );
            counts.current += countWeekdaysInWindow(
                absence.dateFrom,
                absence.dateTo,
                windows.current[0],
                windows.current[1]
            );
            counts.next += countWeekdaysInWindow(
                absence.dateFrom,
                absence.dateTo,
                windows.next[0],
                windows.next[1]
            );
        }

        return persons.map((p) => byPerson.get(p.id as number)!);
    }
}
