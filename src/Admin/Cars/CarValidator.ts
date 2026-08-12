import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import { CarData } from '../../types/types';

/**
 * Walidacja danych samochodu.
 *
 * Rzuca BadRequestError (status 400), NIE zwykłego Error - ten poszedłby jako 500
 * i wygenerował mail-raport awarii do zespołu przy każdej literówce użytkownika.
 */
export default class CarValidator {
    private static readonly MAX_BRAND = 50;
    private static readonly MAX_MODEL = 50;
    private static readonly MAX_PLATE = 15;
    private static readonly MAX_COMMENT = 300;

    /** Waliduje i normalizuje payload tworzenia. Zwraca oczyszczone dane. */
    static validateCreatePayload(dto: any): CarData {
        if (!dto || typeof dto !== 'object')
            throw new BadRequestError('Brak danych samochodu.');

        const brand = this.requireText(dto.brand, 'Marka', this.MAX_BRAND);
        const licensePlateNumber = this.normalisePlate(dto.licensePlateNumber);
        const model = this.requireText(dto.model, 'Model', this.MAX_MODEL);
        const comment = this.optionalText(
            dto.comment,
            'Uwagi',
            this.MAX_COMMENT
        );

        return {
            brand,
            model,
            licensePlateNumber,
            mileageSpreadsheetId: this.optionalText(
                dto.mileageSpreadsheetId,
                'Identyfikator arkusza',
                100
            ),
            mileageSheetGid: this.optionalInteger(
                dto.mileageSheetGid,
                'Numer zakładki arkusza'
            ),
            isActive: dto.isActive === undefined ? true : !!dto.isActive,
            comment,
        } as CarData;
    }

    /** Waliduje payload edycji - wymaga poprawnego id oprócz reszty pól. */
    static validateUpdatePayload(dto: any): CarData {
        const payload = this.validateCreatePayload(dto);
        payload.id = this.requireId(dto.id);
        return payload;
    }

    static requireId(value: any): number {
        const id = Number(value);
        if (!Number.isInteger(id) || id <= 0)
            throw new BadRequestError('Nieprawidłowy identyfikator samochodu.');
        return id;
    }

    /**
     * Liczby dopuszczamy celowo. Tools.parseObjectsJSON woła JSON.parse na KAŻDEJ
     * wartości ciała żądania, więc model "3" (Mazda 3) dociera tu jako liczba
     * i bez tej konwersji byłby odrzucony jako brakujący.
     */
    private static coerceText(value: any): any {
        return typeof value === 'number' && Number.isFinite(value)
            ? String(value)
            : value;
    }

    private static requireText(
        rawValue: any,
        label: string,
        maxLength: number
    ): string {
        const value = this.coerceText(rawValue);
        if (typeof value !== 'string' || value.trim().length === 0)
            throw new BadRequestError(`Pole „${label}” jest wymagane.`);
        const trimmed = value.trim();
        if (trimmed.length > maxLength)
            throw new BadRequestError(
                `Pole „${label}” może mieć najwyżej ${maxLength} znaków.`
            );
        return trimmed;
    }

    private static optionalText(
        rawValue: any,
        label: string,
        maxLength: number
    ): string | null {
        const value = this.coerceText(rawValue);
        if (value === undefined || value === null || value === '') return null;
        if (typeof value !== 'string')
            throw new BadRequestError(`Pole „${label}” musi być tekstem.`);
        const trimmed = value.trim();
        if (trimmed.length === 0) return null;
        if (trimmed.length > maxLength)
            throw new BadRequestError(
                `Pole „${label}” może mieć najwyżej ${maxLength} znaków.`
            );
        return trimmed;
    }

    private static optionalInteger(value: any, label: string): number | null {
        if (value === undefined || value === null || value === '') return null;
        const parsed = Number(value);
        if (!Number.isInteger(parsed))
            throw new BadRequestError(`Pole „${label}” musi być liczbą całkowitą.`);
        return parsed;
    }

    /** Numer rejestracyjny: wielkie litery, pojedyncze spacje - żeby uniknąć duplikatów „OP 123A” / „op  123a”. */
    private static normalisePlate(value: any): string {
        const plate = this.requireText(
            value,
            'Numer rejestracyjny',
            this.MAX_PLATE
        );
        return plate.toUpperCase().replace(/\s+/g, ' ');
    }
}
