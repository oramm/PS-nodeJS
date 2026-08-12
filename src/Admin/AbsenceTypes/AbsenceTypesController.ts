import BaseController from '../../controllers/BaseController';
import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';
import AbsenceType from './AbsenceType';
import AbsenceTypeRepository, {
    AbsenceTypesSearchParams,
} from './AbsenceTypeRepository';
import AbsenceTypeValidator from './AbsenceTypeValidator';

/**
 * Controller słownika typów nieobecności.
 * Przepływ: Router → Controller → (Validator) → Repository → Model
 */
export default class AbsenceTypesController extends BaseController<
    AbsenceType,
    AbsenceTypeRepository
> {
    private static instance: AbsenceTypesController;

    private constructor() {
        super(new AbsenceTypeRepository());
    }

    private static getInstance(): AbsenceTypesController {
        if (!this.instance) {
            this.instance = new AbsenceTypesController();
        }
        return this.instance;
    }

    static async find(
        orConditions: AbsenceTypesSearchParams[] = [{}]
    ): Promise<AbsenceType[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    static async addFromDto(dto: any): Promise<AbsenceType> {
        const payload = AbsenceTypeValidator.validateCreatePayload(dto);
        return await this.add(new AbsenceType(payload));
    }

    static async add(item: AbsenceType): Promise<AbsenceType> {
        const instance = this.getInstance();
        await instance.repository.addInDb(item);
        return item;
    }

    static async editFromDto(dto: any): Promise<AbsenceType> {
        const payload = AbsenceTypeValidator.validateUpdatePayload(dto);
        return await this.edit(new AbsenceType(payload));
    }

    static async edit(item: AbsenceType): Promise<AbsenceType> {
        const instance = this.getInstance();
        await instance.repository.editInDb(item);
        return item;
    }

    /**
     * Usuwa typ nieobecności. Klucz obcy ma ON DELETE RESTRICT, więc typ użyty
     * w historii i tak by nie przeszedł - sprawdzamy to wcześniej, żeby dać
     * konkretny komunikat zamiast generycznego 409.
     */
    static async deleteFromDto(dto: any): Promise<AbsenceType> {
        const id = AbsenceTypeValidator.requireId(dto?.id);
        const instance = this.getInstance();
        const [existing] = await instance.repository.find([{ id }]);
        if (!existing)
            throw new BadRequestError('Typ nieobecności o podanym numerze nie istnieje.');

        const usageCount = existing._usageCount ?? 0;
        if (usageCount > 0)
            throw new BadRequestError(
                `Nie można usunąć - typ jest użyty w ${usageCount} nieobecnościach. ` +
                    'Historia urlopowa musi zostać spójna.'
            );

        await instance.repository.deleteFromDb(existing);
        return existing;
    }
}

export type { AbsenceTypesSearchParams } from './AbsenceTypeRepository';
