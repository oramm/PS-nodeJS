import { BadRequestError } from '../projectAssignments/ProjectScopeGuard';

/**
 * Walidacja wejścia HTTP trasy odczytu zdarzeń konta (ROD-3). Osobna klasa, stateless,
 * fail-fast - zgodnie z regułami warstw (Validator nie jest częścią routera ani kontrolera).
 */
export default class PersonAccountEventValidator {
    static requirePersonId(raw: unknown): number {
        const value = Number(raw);
        if (!Number.isInteger(value) || value <= 0)
            throw new BadRequestError('personId must be a positive integer');
        return value;
    }

    /** Brak parametru = domyślny limit repozytorium; podany musi być dodatnią liczbą całkowitą. */
    static optionalLimit(raw: unknown): number | undefined {
        if (raw === undefined || raw === null || raw === '') return undefined;
        const value = Number(raw);
        if (!Number.isInteger(value) || value <= 0)
            throw new BadRequestError('limit must be a positive integer');
        return value;
    }
}
