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

        const countsAsCare =
            dto.countsAsCare === undefined ? false : !!dto.countsAsCare;
        const countsAsHoliday =
            dto.countsAsHoliday === undefined ? false : !!dto.countsAsHoliday;
        // Domyślnie typ schodzi z limitu urlopu - ale tylko wtedy, gdy nadawca nie wskazał
        // innej puli. Bez tego payload {name, countsAsCare: true} dostawałby 400 za konflikt
        // dwóch pul, którego sam nie zgłosił: druga flaga wzięłaby się z domyślnej wartości.
        const countsAgainstLimit =
            dto.countsAgainstLimit === undefined
                ? !countsAsCare && !countsAsHoliday
                : !!dto.countsAgainstLimit;

        // Pule są rozłączne: kontroler urlopów sprawdza dostępne dni względem JEDNEJ
        // puli (opieka, potem za święta, potem limit urlopu), ale salda roczne sumują
        // każdą flagę osobno. Typ z dwiema flagami zjadałby dwie pule, będąc sprawdzanym
        // względem jednej - salda rozjechałyby się cicho i wstecz. Panel ma trzy niezależne
        // przełączniki, więc jedyne miejsce, gdzie da się to zatrzymać, jest tutaj.
        if ([countsAgainstLimit, countsAsCare, countsAsHoliday].filter(Boolean).length > 1)
            throw new BadRequestError(
                'Typ nieobecności może schodzić najwyżej z jednej puli: ' +
                    'limitu urlopu, opieki albo wolnego za święta.'
            );

        return {
            name,
            color,
            countsAgainstLimit,
            countsAsCare,
            countsAsHoliday,
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
