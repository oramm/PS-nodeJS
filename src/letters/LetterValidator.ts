import Letter from './Letter';
import OurLetterContract from './OurLetterContract';
import OurOldTypeLetter from './OurOldTypeLetter';
import OurLetterOffer from './OurLetterOffer';
import IncomingLetterContract from './IncomingLetterContract';
import IncomingLetterOffer from './IncomingLetterOffer';

/**
 * Wynik walidacji typu Letter
 */
export interface LetterValidationResult {
    isValid: boolean;
    expectedType: string;
    missingFields: string[];
    errors: string[];
}

/**
 * Walidator dla obiektów Letter
 *
 * ODPOWIEDZIALNOŚĆ:
 * - Walidacja atrybutów wymaganych do określenia typu Letter
 * - Walidacja spójności danych biznesowych
 * - Diagnostyka błędów (co jest nie tak)
 *
 * ZGODNOŚĆ Z ARCHITEKTURĄ:
 * - Podobny wzorzec jak InvoiceValidator
 * - Wywoływany przez Controller, nie przez Model
 */
export default class LetterValidator {
    /**
     * Waliduje czy dane mają wystarczające atrybuty do określenia typu Letter
     *
     * WAŻNE: Ta sama kolejność warunków co w LetterRepository.getLetterType()
     *
     * Różnica Repository vs Validator:
     * - Repository: używa ProjectId, OfferId (dane z bazy)
     * - Validator: używa _project, _offer (obiekty z klienta)
     *
     * @param initParam - dane z klienta (z obiektami _project, _offer)
     * @returns wynik walidacji z diagnostyką
     */
    static validateLetterTypeData(initParam: any): LetterValidationResult {
        const result: LetterValidationResult = {
            isValid: false,
            expectedType: 'Unknown',
            missingFields: [],
            errors: [],
        };

        // 1. Walidacja wspólnych wymaganych pól
        if (initParam.isOur === undefined) {
            result.missingFields.push('isOur');
            result.errors.push('Letter must have isOur property defined');
            return result;
        }

        // 2. WALIDACJA KRYTYCZNA: OurLetter MUSI mieć number TYLKO przy edycji (gdy id już istnieje)
        // SCENARIUSZE:
        // - Nowy OurLetter (id === undefined): number będzie ustawiony w addNew() po zapisie do bazy
        // - Edycja OurLetter (id !== undefined): number MUSI istnieć (z bazy lub selecta)
        // BEZPIECZEŃSTWO: Zapobiega edycji OurLetter bez number (zniknie z radaru)
        if (initParam.isOur && initParam.id && !initParam.number) {
            result.missingFields.push('number');
            result.errors.push(
                'CRITICAL: Existing OurLetter (id exists) MUST have a number field!\n' +
                    '  Cannot edit OurLetter without number - it would disappear from radar.\n' +
                    '  Expected: number field with valid value (string or number).\n' +
                    '  NOTE: For new OurLetter (no id), number will be set automatically in addNew().'
            );
            return result;
        }

        // 3. KOLEJNOŚĆ WARUNKÓW JAK W LetterRepository.getLetterType():
        // UWAGA: Przy tworzeniu nowego OurLetter, id i number są undefined
        //        Określamy typ na podstawie _project vs _offer

        // 3.1. OurLetterContract (nowy typ - id == number && _project.id)
        //      LUB: nowy OurLetter z _project (id i number undefined)
        if (initParam.isOur && initParam._project?.id) {
            // Jeśli id istnieje, sprawdź zgodność z number
            if (initParam.id && initParam.id == initParam.number) {
                result.isValid = true;
                result.expectedType = 'OurLetterContract';
                return result;
            }
            // Jeśli id nie istnieje (nowy), akceptuj (number zostanie ustawiony w addNew())
            if (!initParam.id) {
                result.isValid = true;
                result.expectedType = 'OurLetterContract';
                return result;
            }
            // Jeśli id istnieje ale id != number, to błąd (powinien być OurOldTypeLetter)
            // Ten przypadek obsłuży się niżej
        }

        // 3.2. OurOldTypeLetter (stary typ - id != number)
        //      TYLKO dla istniejących pism (id !== undefined && id != number)
        if (
            initParam.isOur &&
            initParam.id &&
            initParam.id != initParam.number
        ) {
            result.isValid = true;
            result.expectedType = 'OurOldTypeLetter';
            return result;
        }

        // 3.3. OurLetterOffer (isOur && _offer.id)
        if (initParam.isOur && initParam._offer?.id) {
            result.isValid = true;
            result.expectedType = 'OurLetterOffer';
            return result;
        }

        // 3.4. IncomingLetterContract (!isOur && _project.id)
        if (!initParam.isOur && initParam._project?.id) {
            result.isValid = true;
            result.expectedType = 'IncomingLetterContract';
            return result;
        }

        // 3.5. IncomingLetterOffer (!isOur && _offer.id)
        if (!initParam.isOur && initParam._offer?.id) {
            result.isValid = true;
            result.expectedType = 'IncomingLetterOffer';
            return result;
        }

        // 4. Brak dopasowania - szczegółowy komunikat błędu
        if (initParam.isOur) {
            result.errors.push(
                'Pismo wychodzące (isOur=true) musi spełniać jeden z warunków:\n' +
                    '  1. _project.id exists → OurLetterContract (new: id/number auto-set, existing: id===number)\n' +
                    '  2. id exists && id !== number → OurOldTypeLetter\n' +
                    '  3. _offer.id exists → OurLetterOffer\n' +
                    '  NOTE: For existing OurLetter (id exists), number field is REQUIRED!'
            );
            result.missingFields.push(
                '_project.id OR _offer.id OR (existing: id && number with id!==number)'
            );
        } else {
            result.errors.push(
                'Pismo przychodzące (isOur=false) musi mieć:\n' +
                    '  1. _project.id → IncomingLetterContract\n' +
                    '  2. _offer.id → IncomingLetterOffer'
            );
            result.missingFields.push('_project.id lub _offer.id');
        }

        return result;
    }

    /**
     * Waliduje czy istniejący obiekt Letter ma spójne dane
     *
     * UWAGA: To NIE jest walidacja typu (która jest w validateLetterTypeData),
     * tylko walidacja spójności danych biznesowych.
     *
     * @param letter - instancja Letter do walidacji
     * @returns lista błędów (pusta = OK)
     */
    static validateLetterData(letter: Letter): string[] {
        const errors: string[] = [];

        // Wspólne wymagane pola
        if (!letter.id) {
            errors.push('Letter must have an ID');
        }

        if (!letter.description || letter.description.trim() === '') {
            errors.push('Letter must have a description');
        }

        if (!letter.creationDate) {
            errors.push('Letter must have a creation date');
        }

        if (!letter.registrationDate) {
            errors.push('Letter must have a registration date');
        }

        if (!letter._cases || letter._cases.length === 0) {
            errors.push('Letter must be associated with at least one Case');
        }

        // Walidacja specyficzna dla typu
        if (letter instanceof OurLetterContract) {
            if (!letter._project?.id) {
                errors.push('OurLetterContract must have _project.id');
            }
            if (letter.number !== letter.id) {
                errors.push('OurLetterContract: number must equal id');
            }
        }

        if (letter instanceof OurOldTypeLetter) {
            if (letter.number === letter.id) {
                errors.push('OurOldTypeLetter: number should not equal id');
            }
        }

        if (letter instanceof IncomingLetterContract) {
            if (!letter._project?.id) {
                errors.push('IncomingLetterContract must have _project.id');
            }
        }

        if (
            letter instanceof OurLetterOffer ||
            letter instanceof IncomingLetterOffer
        ) {
            if (!letter._offer?.id) {
                errors.push('LetterOffer must have _offer.id');
            }
        }

        return errors;
    }

    /**
     * Tworzy szczegółowy komunikat błędu do debugowania
     *
     * @param initParam - dane z klienta
     * @param validation - wynik walidacji
     * @returns sformatowany komunikat błędu
     */
    static formatValidationError(
        initParam: any,
        validation: LetterValidationResult
    ): string {
        const errorDetails = {
            id: initParam.id,
            isOur: initParam.isOur,
            number: initParam.number,
            hasProject: !!initParam._project,
            projectId: initParam._project?.id,
            hasContract: !!initParam._contract,
            contractId: initParam._contract?.id,
            hasOffer: !!initParam._offer,
            offerId: initParam._offer?.id,
            expectedType: validation.expectedType,
            missingFields: validation.missingFields,
            errors: validation.errors,
        };

        return (
            `❌ Letter Validation Failed!\n\n` +
            `Expected type: ${validation.expectedType}\n` +
            `Missing/invalid fields: ${validation.missingFields.join(
                ', '
            )}\n\n` +
            `Errors:\n${validation.errors
                .map((e) => `  - ${e}`)
                .join('\n')}\n\n` +
            `Data received:\n${JSON.stringify(errorDetails, null, 2)}\n\n` +
            `Valid combinations:\n` +
            `  1. OurLetterContract: isOur=true, _project.id exists, number === id\n` +
            `  2. OurOldTypeLetter: isOur=true, number !== id (or missing)\n` +
            `  3. OurLetterOffer: isOur=true, _offer.id exists\n` +
            `  4. IncomingLetterContract: isOur=false, _project.id exists\n` +
            `  5. IncomingLetterOffer: isOur=false, _offer.id exists`
        );
    }
}
