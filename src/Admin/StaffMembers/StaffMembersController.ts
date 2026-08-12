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
     * Zapisuje flagi osoby i zwraca odczytany stan.
     *
     * Ponowny odczyt jest konieczny: upsert nie zwraca kolumn wyliczanych po
     * stronie bazy ani danych osoby z JOIN, więc bez tego frontend dostałby
     * niepełny obiekt i pokazał puste imię tuż po zapisie.
     */
    static async editFromDto(dto: any): Promise<StaffMember> {
        const payload = StaffMemberValidator.validateUpdatePayload(dto);
        const instance = this.getInstance();

        // Wyszukanie bez zawężania - edytujemy też osoby, które nie mają jeszcze
        // wiersza uprawnień, a domyślnie lista ich nie pokazuje.
        const [person] = await instance.repository.find([
            { personId: payload.personId, includeWithoutPermissions: true },
        ]);
        if (!person)
            throw new BadRequestError('Osoba o podanym numerze nie istnieje.');

        await instance.repository.upsertInDb(new StaffMember(payload));

        if (payload.systemRoleId !== undefined)
            await instance.repository.updateSystemRoleInDb(
                payload.personId,
                payload.systemRoleId
            );

        const [updated] = await instance.repository.find([
            { personId: payload.personId, includeWithoutPermissions: true },
        ]);
        return updated;
    }
}

export type { StaffMembersSearchParams } from './StaffMemberAdminRepository';
