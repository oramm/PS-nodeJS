import Setup from '../setup/Setup';
import { parseDateOnly } from './vacations/vacationDateUtils';

/** Walidacja payloadów scrumboarda (osobna klasa wg konwencji). */
export default class ScrumboardValidator {
    private static readonly allowedStatuses = new Set(
        Object.values(Setup.TaskStatus)
    );

    /** Waliduje status zadania względem dozwolonego zbioru (whitelist). */
    static parseTaskStatus(body: any): string {
        const status = body?.status;
        if (typeof status !== 'string' || !this.allowedStatuses.has(status))
            throw new Error(`Nieprawidłowy status zadania: ${status}`);
        return status;
    }

    private static toNullableHours(value: any, field: string): number | null {
        if (value === null || value === undefined || value === '') return null;
        const num = Number(value);
        if (Number.isNaN(num) || num < 0)
            throw new Error(`Nieprawidłowa wartość pola ${field}`);
        return num;
    }

    static parseId(raw: string, field = 'id'): number {
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0)
            throw new Error(`Nieprawidłowe ${field}`);
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
            throw new Error('Brak pól godzin do aktualizacji');
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
                throw new Error(`Nieprawidłowa wartość pola ${field}`);
            result[field] = num;
        }
        return result as any;
    }

    /** Waliduje rok (np. z query ?year=), z sensownym zakresem. */
    static parseYear(raw: any): number {
        const year = Number(raw);
        if (!Number.isInteger(year) || year < 2000 || year > 2100)
            throw new Error(`Nieprawidłowy rok: ${raw}`);
        return year;
    }

    private static parseNote(value: any): string | null {
        if (value === null || value === undefined || value === '') return null;
        const note = String(value).trim();
        if (note.length > 500)
            throw new Error('Notatka jest zbyt długa (max 500 znaków)');
        return note || null;
    }

    private static parseDateRange(body: any): { dateFrom: string; dateTo: string } {
        const dateFrom = parseDateOnly(body?.dateFrom, 'dateFrom');
        const dateTo = parseDateOnly(body?.dateTo, 'dateTo');
        if (dateTo < dateFrom)
            throw new Error('Data końcowa nie może być wcześniejsza niż początkowa');
        return { dateFrom, dateTo };
    }

    /** Payload utworzenia urlopu. */
    static parseAbsenceCreate(body: any): {
        personId: number;
        typeId: number;
        dateFrom: string;
        dateTo: string;
        note: string | null;
    } {
        const personId = this.parseId(body?.personId, 'personId');
        const typeId = this.parseId(body?.typeId, 'typeId');
        const { dateFrom, dateTo } = this.parseDateRange(body);
        return { personId, typeId, dateFrom, dateTo, note: this.parseNote(body?.note) };
    }

    /** Payload edycji urlopu (bez zmiany osoby). */
    static parseAbsenceEdit(body: any): {
        typeId: number;
        dateFrom: string;
        dateTo: string;
        note: string | null;
    } {
        const typeId = this.parseId(body?.typeId, 'typeId');
        const { dateFrom, dateTo } = this.parseDateRange(body);
        return { typeId, dateFrom, dateTo, note: this.parseNote(body?.note) };
    }

    private static parseDayAmount(value: any, field: string): number {
        const num = Number(value);
        if (Number.isNaN(num) || num < 0 || num > 366)
            throw new Error(`Nieprawidłowa liczba dni w polu ${field}`);
        return num;
    }

    /** Wymiar urlopu: bieżący (limitDays) + zaległy (carryoverDays), oba >= 0. */
    static parseVacationLimit(body: any): {
        limitDays: number;
        carryoverDays: number;
    } {
        return {
            limitDays: this.parseDayAmount(body?.limitDays, 'limitDays'),
            carryoverDays: this.parseDayAmount(
                body?.carryoverDays ?? 0,
                'carryoverDays'
            ),
        };
    }
}
