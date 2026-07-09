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
    careDays: number;
    careUsedDays: number;
    careRemainingDays: number;
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

        // suma dni roboczych (pon-pt) nieobecności danego roku spełniających predykat
        const sumUsed = (
            list: ScrumboardAbsence[],
            pick: (a: ScrumboardAbsence) => boolean | undefined
        ) =>
            list
                .filter(pick)
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

        const rows: VacationPersonRow[] = persons.map((person) => {
            const id = person.id as number;
            const personAbsences = absencesByPerson.get(id) ?? [];
            const usedDays = sumUsed(personAbsences, (a) => a._countsAgainstLimit);
            const careUsedDays = sumUsed(personAbsences, (a) => a._countsAsCare);
            const entitlement = entitlementByPerson.get(id);
            const limitDays = entitlement?.limitDays ?? 0;
            const carryoverDays = entitlement?.carryoverDays ?? 0;
            const careDays = entitlement?.careDays ?? 0;
            return {
                personId: id,
                personName: `${person.name ?? ''} ${person.surname ?? ''}`.trim(),
                personAlias: person._alias,
                limitDays,
                carryoverDays,
                usedDays,
                remainingDays: limitDays + carryoverDays - usedDays,
                careDays,
                careUsedDays,
                careRemainingDays: careDays - careUsedDays,
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

    /** Zwraca flagi typu nieobecności (rzuca, gdy typ nieznany). */
    private async getType(typeId: number) {
        const type = (await this.typeRepository.find()).find(
            (t) => t.id === typeId
        );
        if (!type) throw new Error(`Nieznany typ nieobecności: ${typeId}`);
        return type;
    }

    /**
     * Blokuje zapis nieobecności, gdy przekracza roczną pulę:
     *   - 'vacation' => limit urlopu (bieżący + zaległy), typy z CountsAgainstLimit;
     *   - 'care'     => pula opieki (CareDays), typy z CountsAsCare.
     * Walidacja względem roku daty początkowej.
     * ponytail: przypadek zakresu na przełomie roku pomijany jako marginalny.
     */
    private async assertWithinPool(
        kind: 'vacation' | 'care',
        personId: number,
        dateFrom: string,
        dateTo: string,
        excludeAbsenceId?: number
    ): Promise<void> {
        const year = Number(dateFrom.slice(0, 4));
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        const [entitlements, absences] = await Promise.all([
            this.entitlementRepository.find(year),
            this.repository.find({
                rangeStart: yearStart,
                rangeEnd: yearEnd,
                personIds: [personId],
            }),
        ]);
        const entitlement = entitlements.find((e) => e.personId === personId);
        const pool =
            kind === 'care'
                ? entitlement?.careDays ?? 0
                : (entitlement?.limitDays ?? 0) +
                  (entitlement?.carryoverDays ?? 0);
        const counts = (a: ScrumboardAbsence) =>
            kind === 'care' ? a._countsAsCare : a._countsAgainstLimit;
        const alreadyUsed = absences
            .filter((a) => counts(a) && a.id !== excludeAbsenceId)
            .reduce(
                (sum, a) =>
                    sum +
                    countWeekdaysInWindow(a.dateFrom, a.dateTo, yearStart, yearEnd),
                0
            );
        const requested = countWeekdaysInWindow(
            dateFrom,
            dateTo,
            yearStart,
            yearEnd
        );
        if (alreadyUsed + requested > pool) {
            const label = kind === 'care' ? 'dni opieki' : 'dni urlopu';
            throw new Error(
                `Brak dostępnych ${label} (pula: ${pool}, wykorzystane: ${alreadyUsed}, żądane: ${requested}).`
            );
        }
    }

    /** Waliduje pulę właściwą dla typu (urlop / opieka); typy bez puli pomija. */
    private async assertTypeWithinPool(
        type: { countsAgainstLimit: boolean; countsAsCare: boolean },
        personId: number,
        dateFrom: string,
        dateTo: string,
        excludeAbsenceId?: number
    ): Promise<void> {
        if (type.countsAsCare)
            await this.assertWithinPool('care', personId, dateFrom, dateTo, excludeAbsenceId);
        else if (type.countsAgainstLimit)
            await this.assertWithinPool('vacation', personId, dateFrom, dateTo, excludeAbsenceId);
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
        const type = await instance.getType(values.typeId);
        await instance.assertTypeWithinPool(
            type,
            values.personId,
            values.dateFrom,
            values.dateTo
        );
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
        const type = await instance.getType(values.typeId);
        await instance.assertTypeWithinPool(
            type,
            existing.personId,
            values.dateFrom,
            values.dateTo,
            id
        );
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

    /** Ustawia roczny wymiar urlopu (bieżący + zaległy + opieka) dla osoby (UPSERT). */
    static async setLimit(
        personId: number,
        year: number,
        limitDays: number,
        carryoverDays: number,
        careDays: number
    ) {
        return this.getInstance().entitlementRepository.upsert(
            personId,
            year,
            limitDays,
            carryoverDays,
            careDays
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
