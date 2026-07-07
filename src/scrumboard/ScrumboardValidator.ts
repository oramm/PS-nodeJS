import Setup from '../setup/Setup';

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
}
