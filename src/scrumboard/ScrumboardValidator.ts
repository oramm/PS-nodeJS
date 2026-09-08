import { BadRequestError } from '../persons/projectAssignments/ProjectScopeGuard';
import Setup from '../setup/Setup';
import {
    MINUTES_PER_DAY,
    isWeekend,
    parseDateOnly,
    parseTimeOnly,
    timeToMinutes,
    toDate,
} from './vacations/vacationDateUtils';

/**
 * Walidacja payloadów scrumboarda (osobna klasa wg konwencji).
 *
 * Wszystko tutaj to błędy WEJŚCIA, więc BadRequestError (400), nie goły Error.
 * Goły Error middleware mapuje na 500 z mailem-raportem do zespołu - literówka
 * użytkownika nie jest awarią serwera.
 */
export default class ScrumboardValidator {
    private static readonly allowedStatuses = new Set(
        Object.values(Setup.TaskStatus)
    );

    /** Waliduje status zadania względem dozwolonego zbioru (whitelist). */
    static parseTaskStatus(body: any): string {
        const status = body?.status;
        if (typeof status !== 'string' || !this.allowedStatuses.has(status))
            throw new BadRequestError(`Nieprawidłowy status zadania: ${status}`);
        return status;
    }

    private static toNullableHours(value: any, field: string): number | null {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        if (Number.isNaN(num) || num < 0)
            throw new BadRequestError(`Nieprawidłowa wartość pola ${field}`);
        return num;
    }

    static parseId(raw: string, field = 'id'): number {
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0)
            throw new BadRequestError(`Nieprawidłowe ${field}`);
        return id;
    }

    static parseDiscussed(body: any): boolean {
        return Boolean(body?.discussed);
    }

    /** Zwraca tylko przekazane pola godzin (undefined = pominięte, null = wyczyść). */
    static parseTaskHours(body: any): {
        estimatedHours?: number | null;
        hoursMon?: number | null;
        hoursTue?: number | null;
        hoursWed?: number | null;
        hoursThu?: number | null;
        hoursFri?: number | null;
    } {
        const fields = [
            'estimatedHours',
            'hoursMon',
            'hoursTue',
            'hoursWed',
            'hoursThu',
            'hoursFri',
        ] as const;
        const result: Record<string, number | null> = {};
        for (const field of fields)
            if (field in (body ?? {}))
                result[field] = this.toNullableHours(body[field], field);
        if (Object.keys(result).length === 0)
            throw new BadRequestError('Brak pól godzin do aktualizacji');
        return result;
    }

    static parsePlanning(body: any): {
        workingDays: number;
        hoursPerDay: number;
        planningMeetingHours: number;
        retroMeetingHours: number;
        extraMeetingsHours: number;
    } {
        const required = [
            'workingDays',
            'hoursPerDay',
            'planningMeetingHours',
            'retroMeetingHours',
            'extraMeetingsHours',
        ] as const;
        const result: Record<string, number> = {};
        for (const field of required) {
            const num = Number(body?.[field]);
            if (Number.isNaN(num) || num < 0)
                throw new BadRequestError(`Nieprawidłowa wartość pola ${field}`);
            result[field] = num;
        }
        return result as any;
    }

    /** Waliduje rok (np. z query ?year=), z sensownym zakresem. */
    static parseYear(raw: any): number {
        const year = Number(raw);
        if (!Number.isInteger(year) || year < 2000 || year > 2100)
            throw new BadRequestError(`Nieprawidłowy rok: ${raw}`);
        return year;
    }

    private static parseNote(value: any): string | null {
        if (value === null || value === undefined || value === '') return null;
        const note = String(value).trim();
        if (note.length > 500)
            throw new BadRequestError('Notatka jest zbyt długa (max 500 znaków)');
        return note || null;
    }

    /** Opakowuje błąd czystej funkcji dat w 400 - zły format daty to literówka, nie awaria. */
    private static parseDateField(value: any, field: string): string {
        try {
            return parseDateOnly(value, field);
        } catch (error) {
            throw new BadRequestError((error as Error).message);
        }
    }

    private static parseDateRange(body: any): { dateFrom: string; dateTo: string } {
        const dateFrom = this.parseDateField(body?.dateFrom, 'dateFrom');
        const dateTo = this.parseDateField(body?.dateTo, 'dateTo');
        if (dateTo < dateFrom)
            throw new BadRequestError('Data końcowa nie może być wcześniejsza niż początkowa');
        // Pule (urlop, opieka, wolne za święta) rozliczają się rocznikami, a walidacja
        // dostępnych dni patrzy na rok daty początkowej. Zakres przez sylwestra schodziłby
        // w całości ze starego rocznika, cicho zawyżając jego zużycie i zaniżając nowy.
        // Granica roku jest niewidoczna w kalendarzu, więc zamiast dzielić zakres po cichu
        // za użytkownika, każemy wpisać dwa - wtedy widać, ile schodzi z której puli.
        if (dateFrom.slice(0, 4) !== dateTo.slice(0, 4))
            throw new BadRequestError(
                'Nieobecność na przełomie roku wpisz osobno dla każdego roku - ' +
                    'pule dni rozliczają się rocznikami.'
            );
        return { dateFrom, dateTo };
    }

    /**
     * Godziny nieobecności na część dnia. Puste oba pola = cały dzień, czyli zachowanie
     * sprzed packa GOD. Reguła spójności "albo oba puste, albo oba wypełnione i wtedy
     * DateFrom = DateTo" jest pilnowana tutaj, a nie więzem w bazie.
     *
     * Czego NIE sprawdzamy w tym miejscu: czy typ nieobecności w ogóle dopuszcza część dnia
     * i czy termin nie koliduje z inną nieobecnością - jedno i drugie wymaga bazy,
     * więc siedzi w kontrolerze.
     */
    private static parseTimes(
        body: any,
        dateFrom: string,
        dateTo: string
    ): { startTime: string | null; endTime: string | null } {
        const isEmpty = (value: any) =>
            value === null || value === undefined || value === '';
        const rawStart = body?.startTime;
        const rawEnd = body?.endTime;
        if (isEmpty(rawStart) && isEmpty(rawEnd))
            return { startTime: null, endTime: null };
        if (isEmpty(rawStart) || isEmpty(rawEnd))
            throw new BadRequestError(
                'Podaj obie godziny — początkową i końcową — albo żadnej.'
            );

        let startTime: string;
        let endTime: string;
        try {
            startTime = parseTimeOnly(rawStart, 'startTime');
            endTime = parseTimeOnly(rawEnd, 'endTime');
        } catch (error) {
            throw new BadRequestError((error as Error).message);
        }

        // Pełne godziny, bez minut (decyzja ownera 2026-09-02). Okno i tak podpowiada
        // krokiem godzinowym, ale źródłem prawdy zostaje serwer.
        if (!/^\d{2}:00$/.test(startTime) || !/^\d{2}:00$/.test(endTime))
            throw new BadRequestError(
                'Nieobecność godzinową wpisuje się w pełnych godzinach — bez minut.'
            );

        if (dateFrom !== dateTo)
            throw new BadRequestError(
                'Część dnia wpisz na jeden dzień — podaj tę samą datę początkową i końcową.'
            );
        if (isWeekend(toDate(dateFrom)))
            throw new BadRequestError(
                'To dzień wolny — nieobecności godzinowej nie ma z czego odjąć.'
            );

        const minutes = timeToMinutes(endTime) - timeToMinutes(startTime);
        if (minutes <= 0)
            throw new BadRequestError(
                'Godzina końcowa musi być późniejsza niż początkowa.'
            );
        // 8 h i więcej to już cały dzień pracy. Bez tej bramki ten sam fakt dałoby się
        // zapisać dwoma sposobami, a saldo zależałoby od tego, który wybrał wpisujący.
        if (minutes >= MINUTES_PER_DAY)
            throw new BadRequestError(
                'To cały dzień pracy — przełącz na tryb «Całe dni».'
            );

        return { startTime, endTime };
    }

    /** Payload utworzenia urlopu. */
    static parseAbsenceCreate(body: any): {
        personId: number;
        typeId: number;
        dateFrom: string;
        dateTo: string;
        startTime: string | null;
        endTime: string | null;
        note: string | null;
    } {
        const personId = this.parseId(body?.personId, 'personId');
        const typeId = this.parseId(body?.typeId, 'typeId');
        const { dateFrom, dateTo } = this.parseDateRange(body);
        const { startTime, endTime } = this.parseTimes(body, dateFrom, dateTo);
        return {
            personId,
            typeId,
            dateFrom,
            dateTo,
            startTime,
            endTime,
            note: this.parseNote(body?.note),
        };
    }

    /** Payload edycji urlopu (bez zmiany osoby). */
    static parseAbsenceEdit(body: any): {
        typeId: number;
        dateFrom: string;
        dateTo: string;
        startTime: string | null;
        endTime: string | null;
        note: string | null;
    } {
        const typeId = this.parseId(body?.typeId, 'typeId');
        const { dateFrom, dateTo } = this.parseDateRange(body);
        const { startTime, endTime } = this.parseTimes(body, dateFrom, dateTo);
        return {
            typeId,
            dateFrom,
            dateTo,
            startTime,
            endTime,
            note: this.parseNote(body?.note),
        };
    }

    private static parseDayAmount(value: any, field: string): number {
        const num = Number(value);
        if (Number.isNaN(num) || num < 0 || num > 366)
            throw new BadRequestError(`Nieprawidłowa liczba dni w polu ${field}`);
        return num;
    }

    /** Wymiar urlopu: bieżący + zaległy + pula opieki + pula za święta, wszystkie >= 0. */
    static parseVacationLimit(body: any): {
        limitDays: number;
        carryoverDays: number;
        careDays: number;
        holidayDays: number;
    } {
        return {
            limitDays: this.parseDayAmount(body?.limitDays, 'limitDays'),
            carryoverDays: this.parseDayAmount(
                body?.carryoverDays ?? 0,
                'carryoverDays'
            ),
            careDays: this.parseDayAmount(body?.careDays ?? 0, 'careDays'),
            holidayDays: this.parseDayAmount(
                body?.holidayDays ?? 0,
                'holidayDays'
            ),
        };
    }
}
