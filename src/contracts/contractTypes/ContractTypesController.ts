import ContractType from './ContractType';
import ContractTypeRepository, {
    ContractTypesSearchParams,
} from './ContractTypeRepository';

/**
 * Controller dla typów kontraktów
 * Wzorzec: Singleton + static methods + delegacja do Repository
 * Przepływ: Router → Controller → Repository → Model
 */
export default class ContractTypesController {
    private static instance: ContractTypesController;
    private repository: ContractTypeRepository;

    private constructor() {
        this.repository = new ContractTypeRepository();
    }

    private static getInstance(): ContractTypesController {
        if (!this.instance) {
            this.instance = new ContractTypesController();
        }
        return this.instance;
    }

    /**
     * Wyszukuje typy kontraktów według podanych kryteriów
     * @param orConditions - tablica warunków wyszukiwania łączonych przez OR
     */
    static async find(
        orConditions: ContractTypesSearchParams[] = [{}]
    ): Promise<ContractType[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * Dodaje nowy typ kontraktu z DTO
     * @param dto - dane z żądania HTTP
     */
    static async addFromDto(dto: any): Promise<ContractType> {
        const instance = this.getInstance();
        const item = new ContractType(dto);
        await instance.repository.addInDb(item);
        return item;
    }

    /**
     * Edytuje typ kontraktu z DTO
     * @param dto - dane z żądania HTTP
     */
    static async editFromDto(dto: any): Promise<ContractType> {
        const instance = this.getInstance();
        const item = new ContractType(dto);
        await instance.repository.editInDb(item);
        return item;
    }

    /**
     * Usuwa typ kontraktu z DTO
     * @param dto - dane z żądania HTTP
     */
    static async deleteFromDto(dto: any): Promise<ContractType> {
        const instance = this.getInstance();
        const item = new ContractType(dto);
        await instance.repository.deleteFromDb(item);
        return item;
    }
}

// Re-export typu dla backward compatibility
export type { ContractTypesSearchParams } from './ContractTypeRepository';
