import BaseController from '../../controllers/BaseController';
import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import StaffMember from './StaffMember';
import StaffMemberAdminRepository, {
    StaffMembersSearchParams,
} from './StaffMemberAdminRepository';
import StaffMemberValidator from './StaffMemberValidator';

/**
 * Controller uprawnień personelu.
 *
 * Brak add i delete - to nie słownik. Panel edytuje flagi istniejących osób,
 * nie tworzy ludzi. Odejście z firmy to isActive = false, nie usunięcie wiersza.
 */
export default class StaffMembersController extends BaseController<
    StaffMember,
    StaffMemberAdminRepository
> {
    private static instance: StaffMembersController;

    private constructor() {
        super(new StaffMemberAdminRepository());
    }

    private static getInstance(): StaffMembersController {
        if (!this.instance) {
            this.instance = new StaffMembersController();
        }
        return this.instance;
    }

    static async find(
        orConditions: StaffMembersSearchParams[] = [{}]
    ): Promise<StaffMember[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * Zapisuje flagi i „aktywny" osoby i zwraca odczytany stan.
     *
     * Tylko flagi. Rola, e-mail systemowy i flaga FIDmana w treści są ignorowane -
     * konto ma jedną drogę zapisu, PUT /v2/persons/:personId/account, bo tylko ona
     * unieważnia sesje po zmianie roli i kolejkuje push do FIDmana (pack PER).
     * Klient woła ją osobno, PO zapisie flag: domyślne flagi zakładane przy zmianie
     * roli (INSERT IGNORE) trafiają wtedy na istniejący wiersz i niczego nie nadpisują.
     *
     * Ponowny odczyt jest konieczny: upsert nie zwraca kolumn wyliczanych po
     * stronie bazy ani danych osoby z JOIN, więc bez tego frontend dostałby
     * niepełny obiekt i pokazał puste imię tuż po zapisie.
     */
    static async editFromDto(dto: any): Promise<StaffMember> {
        const payload = StaffMemberValidator.validateUpdatePayload(dto);
        const instance = this.getInstance();

        // Wyszukanie bez zawężania - edytujemy też osoby, które nie są jeszcze
        // użytkownikami (brak e-maila systemowego i wiersza flag), a domyślny zakres
        // listy ich nie pokazuje.
        const [person] = await instance.repository.find([
            { personId: payload.personId, scope: 'all' },
        ]);
        if (!person)
            throw new BadRequestError('Osoba o podanym numerze nie istnieje.');

        await instance.repository.upsertInDb(new StaffMember(payload));

        const [updated] = await instance.repository.find([
            { personId: payload.personId, scope: 'all' },
        ]);
        return updated;
    }
}

export type { StaffMembersSearchParams } from './StaffMemberAdminRepository';
