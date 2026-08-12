import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import { AbsenceTypeData } from '../../types/types';

/**
 * Walidacja typu nieobecności.
 * Rzuca BadRequestError (400) - zwykły Error poszedłby jako 500 z mailem-raportem.
 */
export default class AbsenceTypeValidator {
    private static readonly MAX_NAME = 60;
    /** Kolumna Color to wolny VARCHAR(20); wymuszamy format, żeby UI nie dostało śmieci. */
    private static readonly HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

    static validateCreatePayload(dto: any): AbsenceTypeData {
        if (!dto || typeof dto !== 'object')
            throw new BadRequestError('Brak danych typu nieobecności.');

        if (typeof dto.name !== 'string' || dto.name.trim().length === 0)
            throw new BadRequestError('Nazwa typu jest wymagana.');
        const name = dto.name.trim();
        if (name.length > this.MAX_NAME)
            throw new BadRequestError(
                `Nazwa może mieć najwyżej ${this.MAX_NAME} znaków.`
            );

        const color =
            typeof dto.color === 'string' && dto.color.trim()
                ? dto.color.trim()
                : '#0d6efd';
        if (!this.HEX_COLOR.test(color))
            throw new BadRequestError(
                'Kolor musi być zapisany jako sześć znaków szesnastkowych, np. #0d6efd.'
            );

        return {
            name,
            color,
            countsAgainstLimit:
                dto.countsAgainstLimit === undefined
                    ? true
                    : !!dto.countsAgainstLimit,
            countsAsCare:
                dto.countsAsCare === undefined ? false : !!dto.countsAsCare,
        } as AbsenceTypeData;
    }

    static validateUpdatePayload(dto: any): AbsenceTypeData {
        const payload = this.validateCreatePayload(dto);
        payload.id = this.requireId(dto.id);
        return payload;
    }

    static requireId(value: any): number {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0)
            throw new BadRequestError(
                'Nieprawidłowy identyfikator typu nieobecności.'
            );
        return id;
    }
}
