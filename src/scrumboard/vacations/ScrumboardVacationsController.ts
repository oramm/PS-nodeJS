import BaseController from '../../controllers/BaseController';
import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import { getScrumboardPersons } from '../ScrumboardPersons';
import ScrumboardAbsence from './ScrumboardAbsence';
import ScrumboardAbsenceRepository from './ScrumboardAbsenceRepository';
import ScrumboardAbsenceTypeRepository from './ScrumboardAbsenceTypeRepository';
import ScrumboardVacationEntitlementRepository from './ScrumboardVacationEntitlementRepository';
import {
    countWorkMinutes,
    countWorkMinutesInWindow,
    daysToMinutes,
    formatAbsenceTerm,
    formatDays,
    minutesToDays,
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
    holidayDays: number;
    holidayUsedDays: number;
    holidayRemainingDays: number;
    absences: ScrumboardAbsence[];
}

export interface VacationsYearData {
    year: number;
    types: {
        id: number;
        name: string;
        color: string;
        countsAgainstLimit: boolean;
        countsAsCare: boolean;
        countsAsHoliday: boolean;
        allowsPartialDay: boolean;
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

        // Suma MINUT nieobecności danego roku spełniających predykat. Rachunek idzie
        // w minutach (dzień = 480), na dni przeliczamy dopiero przy zwracaniu wiersza -
        // inaczej sumowanie ułamków dnia dryfowałoby i psuło porównania z pulą.
        const sumUsedMinutes = (
            list: ScrumboardAbsence[],
            pick: (a: ScrumboardAbsence) => boolean | undefined
        ) =>
            list
                .filter(pick)
                .reduce(
                    (sum, a) =>
                        sum +
                        countWorkMinutesInWindow(
                            a.dateFrom,
                            a.dateTo,
                            a.startTime,
                            a.endTime,
                            yearStart,
                            yearEnd
                        ),
                    0
                );

        const rows: VacationPersonRow[] = persons.map((person) => {
            const id = person.id as number;
            const personAbsences = absencesByPerson.get(id) ?? [];
            const usedMinutes = sumUsedMinutes(
                personAbsences,
                (a) => a._countsAgainstLimit
            );
            const careUsedMinutes = sumUsedMinutes(
                personAbsences,
                (a) => a._countsAsCare
            );
            const holidayUsedMinutes = sumUsedMinutes(
                personAbsences,
                (a) => a._countsAsHoliday
            );
            const entitlement = entitlementByPerson.get(id);
            const limitDays = entitlement?.limitDays ?? 0;
            const carryoverDays = entitlement?.carryoverDays ?? 0;
            const careDays = entitlement?.careDays ?? 0;
            const holidayDays = entitlement?.holidayDays ?? 0;
            return {
                personId: id,
                personName: `${person.name ?? ''} ${person.surname ?? ''}`.trim(),
                personAlias: person._alias,
                limitDays,
                carryoverDays,
                usedDays: minutesToDays(usedMinutes),
                // reszta liczona w minutach i przeliczana raz - odejmowanie ułamków dnia
                // potrafiłoby dać 1,4999999999 zamiast 1,5
                remainingDays: minutesToDays(
                    daysToMinutes(limitDays + carryoverDays) - usedMinutes
                ),
                careDays,
                careUsedDays: minutesToDays(careUsedMinutes),
                careRemainingDays: minutesToDays(
                    daysToMinutes(careDays) - careUsedMinutes
                ),
                holidayDays,
                holidayUsedDays: minutesToDays(holidayUsedMinutes),
                holidayRemainingDays: minutesToDays(
                    daysToMinutes(holidayDays) - holidayUsedMinutes
                ),
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
                countsAsCare: t.countsAsCare,
                countsAsHoliday: t.countsAsHoliday,
                allowsPartialDay: t.allowsPartialDay,
            })),
            rows,
        };
    }

    /** Zwraca flagi typu nieobecności (rzuca, gdy typ nieznany). */
    private async getType(typeId: number) {
        const type = (await this.typeRepository.find()).find(
            (t) => t.id === typeId
        );
        if (!type)
            throw new BadRequestError(`Nieznany typ nieobecności: ${typeId}`);
        return type;
    }

    /**
     * Odrzuca godziny dla typu, który wolno brać wyłącznie na całe dni.
     * O tym, które to typy, decyduje flaga w panelu administracyjnym (decyzja ownera D1) -
     * system NIE zna prawnych różnic między opieką, urlopem a wolnym za święto.
     */
    private assertTypeAllowsPartialDay(
        type: { name: string; allowsPartialDay: boolean },
        startTime: string | null
    ): void {
        if (startTime && !type.allowsPartialDay)
            throw new BadRequestError(
                `Typ «${type.name}» można wpisać tylko na całe dni.`
            );
    }

    /**
     * Blokuje drugą nieobecność tej samej osoby w terminie już zajętym (decyzja ownera D5).
     * Działa na CAŁY zakres, nie tylko na dzień identyczny: opieka 12 sierpnia w czasie
     * urlopu 10-14 sierpnia jest odrzucana. Godzin celowo nie porównujemy - dzień zajęty
     * jest zajęty, bo widok miesięczny i tak pokazałby tylko jedną z dwóch nieobecności,
     * a kalendarz zacząłby kłamać. Przy edycji własny wiersz jest pomijany.
     */
    private async assertNoOverlap(
        personId: number,
        dateFrom: string,
        dateTo: string,
        excludeAbsenceId?: number
    ): Promise<void> {
        const overlapping = (
            await this.repository.find({
                rangeStart: dateFrom,
                rangeEnd: dateTo,
                personIds: [personId],
            })
        ).filter((a) => a.id !== excludeAbsenceId);
        if (overlapping.length === 0) return;
        const conflict = overlapping[0];
        throw new BadRequestError(
            `Ta osoba ma już nieobecność w tym terminie: «${conflict._typeName}», ` +
                `${formatAbsenceTerm(conflict.dateFrom, conflict.dateTo)}. ` +
                'Zmień termin albo popraw tamten wpis.'
        );
    }

    /**
     * Blokuje zapis nieobecności, gdy przekracza roczną pulę:
     *   - 'vacation' => limit urlopu (bieżący + zaległy), typy z CountsAgainstLimit;
     *   - 'care'     => pula opieki (CareDays), typy z CountsAsCare;
     *   - 'holiday'  => pula wolnego za święta (HolidayDays), typy z CountsAsHoliday.
     * Walidacja względem roku daty początkowej - i to wystarcza, bo
     * ScrumboardValidator.parseDateRange nie przepuszcza zakresu przez granicę roku.
     */
    private async assertWithinPool(
        kind: 'vacation' | 'care' | 'holiday',
        personId: number,
        dateFrom: string,
        dateTo: string,
        startTime: string | null,
        endTime: string | null,
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
                : kind === 'holiday'
                ? entitlement?.holidayDays ?? 0
                : (entitlement?.limitDays ?? 0) +
                  (entitlement?.carryoverDays ?? 0);
        const counts = (a: ScrumboardAbsence) =>
            kind === 'care'
                ? a._countsAsCare
                : kind === 'holiday'
                ? a._countsAsHoliday
                : a._countsAgainstLimit;
        // Porównanie idzie w minutach. Na ułamkach dnia wniosek mieszczący się co do
        // minuty bywałby odrzucany przez dryf zmiennoprzecinkowy - użytkownik zobaczyłby
        // "brak dni" przy pustej puli na papierze.
        const poolMinutes = daysToMinutes(pool);
        const alreadyUsedMinutes = absences
            .filter((a) => counts(a) && a.id !== excludeAbsenceId)
            .reduce(
                (sum, a) =>
                    sum +
                    countWorkMinutesInWindow(
                        a.dateFrom,
                        a.dateTo,
                        a.startTime,
                        a.endTime,
                        yearStart,
                        yearEnd
                    ),
                0
            );
        const requestedMinutes = countWorkMinutesInWindow(
            dateFrom,
            dateTo,
            startTime,
            endTime,
            yearStart,
            yearEnd
        );
        if (alreadyUsedMinutes + requestedMinutes > poolMinutes) {
            const label =
                kind === 'care'
                    ? 'dni opieki'
                    : kind === 'holiday'
                    ? 'dni wolnego za święta'
                    : 'dni urlopu';
            throw new BadRequestError(
                `Brak dostępnych ${label} (pula: ${formatDays(pool)}, ` +
                    `wykorzystane: ${formatDays(minutesToDays(alreadyUsedMinutes))}, ` +
                    `żądane: ${formatDays(minutesToDays(requestedMinutes))}).`
            );
        }
    }

    /** Waliduje pulę właściwą dla typu (urlop / opieka / za święta); typy bez puli pomija. */
    private async assertTypeWithinPool(
        type: {
            countsAgainstLimit: boolean;
            countsAsCare: boolean;
            countsAsHoliday: boolean;
        },
        personId: number,
        dateFrom: string,
        dateTo: string,
        startTime: string | null,
        endTime: string | null,
        excludeAbsenceId?: number
    ): Promise<void> {
        const args = [
            personId,
            dateFrom,
            dateTo,
            startTime,
            endTime,
            excludeAbsenceId,
        ] as const;
        if (type.countsAsCare) await this.assertWithinPool('care', ...args);
        else if (type.countsAsHoliday)
            await this.assertWithinPool('holiday', ...args);
        else if (type.countsAgainstLimit)
            await this.assertWithinPool('vacation', ...args);
    }

    /** Tworzy nieobecność. Zwraca zapisany rekord (z Id i policzonymi dniami). */
    static async addAbsence(
        values: {
            personId: number;
            typeId: number;
            dateFrom: string;
            dateTo: string;
            startTime: string | null;
            endTime: string | null;
            note: string | null;
        },
        createdByPersonId?: number
    ): Promise<ScrumboardAbsence> {
        const instance = this.getInstance();
        const type = await instance.getType(values.typeId);
        instance.assertTypeAllowsPartialDay(type, values.startTime);
        await instance.assertNoOverlap(
            values.personId,
            values.dateFrom,
            values.dateTo
        );
        await instance.assertTypeWithinPool(
            type,
            values.personId,
            values.dateFrom,
            values.dateTo,
            values.startTime,
            values.endTime
        );
        const absence = new ScrumboardAbsence({
            ...values,
            workingDaysCount: minutesToDays(
                countWorkMinutes(
                    values.dateFrom,
                    values.dateTo,
                    values.startTime,
                    values.endTime
                )
            ),
            createdByPersonId: createdByPersonId ?? null,
        });
        const id = await instance.repository.insert(absence);
        return (await instance.repository.findById(id)) ?? absence;
    }

    /** Edytuje nieobecność (typ, zakres, godziny, notatka). */
    static async editAbsence(
        id: number,
        values: {
            typeId: number;
            dateFrom: string;
            dateTo: string;
            startTime: string | null;
            endTime: string | null;
            note: string | null;
        }
    ): Promise<ScrumboardAbsence> {
        const instance = this.getInstance();
        const existing = await instance.repository.findById(id);
        if (!existing)
            throw new BadRequestError(`Nie znaleziono urlopu o id ${id}`);
        const type = await instance.getType(values.typeId);
        instance.assertTypeAllowsPartialDay(type, values.startTime);
        // przy edycji własny wiersz nie jest kolizją sam ze sobą
        await instance.assertNoOverlap(
            existing.personId,
            values.dateFrom,
            values.dateTo,
            id
        );
        await instance.assertTypeWithinPool(
            type,
            existing.personId,
            values.dateFrom,
            values.dateTo,
            values.startTime,
            values.endTime,
            id
        );
        const updated = new ScrumboardAbsence({
            ...existing,
            ...values,
            id,
            personId: existing.personId,
            workingDaysCount: minutesToDays(
                countWorkMinutes(
                    values.dateFrom,
                    values.dateTo,
                    values.startTime,
                    values.endTime
                )
            ),
        });
        await instance.repository.update(updated);
        return (await instance.repository.findById(id)) ?? updated;
    }

    static async deleteAbsence(id: number): Promise<void> {
        await this.getInstance().repository.deleteById(id);
    }

    /** Ustawia roczny wymiar urlopu (bieżący + zaległy + opieka + za święta) dla osoby (UPSERT). */
    static async setLimit(
        personId: number,
        year: number,
        limitDays: number,
        carryoverDays: number,
        careDays: number,
        holidayDays: number
    ) {
        return this.getInstance().entitlementRepository.upsert(
            personId,
            year,
            limitDays,
            carryoverDays,
            careDays,
            holidayDays
        );
    }

    /**
     * Liczba dni urlopu (dni robocze, WSZYSTKIE typy - liczy się kto jest nieobecny)
     * w tygodniu poprzednim/bieżącym/następnym, per osoba scrumboardu.
     * Od packa GOD liczby bywają ułamkowe (część dnia), np. 1,5.
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

        // liczniki zbieramy w minutach, na dni przeliczamy raz, na wyjściu
        for (const absence of absences) {
            const counts = byPerson.get(absence.personId);
            if (!counts) continue;
            const inWindow = (window: [string, string]) =>
                countWorkMinutesInWindow(
                    absence.dateFrom,
                    absence.dateTo,
                    absence.startTime,
                    absence.endTime,
                    window[0],
                    window[1]
                );
            counts.prev += inWindow(windows.prev);
            counts.current += inWindow(windows.current);
            counts.next += inWindow(windows.next);
        }

        return persons.map((p) => {
            const counts = byPerson.get(p.id as number)!;
            return {
                personId: counts.personId,
                prev: minutesToDays(counts.prev),
                current: minutesToDays(counts.current),
                next: minutesToDays(counts.next),
            };
        });
    }
}
