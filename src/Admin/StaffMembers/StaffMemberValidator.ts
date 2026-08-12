import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import { StaffMemberData } from '../../types/types';

/**
 * Walidacja uprawnień personelu.
 *
 * Flagi przyjmujemy WYŁĄCZNIE jako boolean. Odrzucamy 'true', 1 i '1' celowo:
 * te wartości sterują dostępem do faktur kosztowych i wyciągów bankowych, więc
 * niejawna konwersja typu jest tu ostatnią rzeczą, jakiej chcemy.
 */
export default class StaffMemberValidator {
    /** Zamknięta lista pól zapisywalnych - wszystko poza nią jest ignorowane. */
    static readonly FLAGS = [
        'isDriver',
        'isInScrum',
        'hasCostInvoiceAccess',
        'hasBankAccess',
        'canLogSiteVisits',
        'isActive',
    ] as const;

    static validateUpdatePayload(dto: any): StaffMemberData & { systemRoleId?: number } {
        if (!dto || typeof dto !== 'object')
            throw new BadRequestError('Brak danych uprawnień.');

        const payload: any = { personId: this.requirePersonId(dto.personId) };

        // Rola zakresowa (pracownik kontraktowy, klient) jest tu dozwolona - formularz
        // pokazuje wtedy wybór projektów i zapisuje je osobnym żądaniem, tak samo
        // jak ekran użytkowników.
        if (dto.systemRoleId !== undefined && dto.systemRoleId !== null && dto.systemRoleId !== '') {
            const systemRoleId = Number(dto.systemRoleId);
            if (!Number.isInteger(systemRoleId) || systemRoleId <= 0)
                throw new BadRequestError('Nieprawidłowa rola systemowa.');
            payload.systemRoleId = systemRoleId;
        }

        for (const flag of this.FLAGS) {
            const value = dto[flag];
            if (value === undefined) {
                throw new BadRequestError(`Brak wartości flagi „${flag}”.`);
            }
            if (typeof value !== 'boolean') {
                throw new BadRequestError(
                    `Flaga „${flag}” musi być wartością logiczną (true/false).`
                );
            }
            payload[flag] = value;
        }

        return payload as StaffMemberData;
    }

    static requirePersonId(value: any): number {
        const personId = Number(value);
        if (!Number.isInteger(personId) || personId <= 0)
            throw new BadRequestError('Nieprawidłowy identyfikator osoby.');
        return personId;
    }
}
