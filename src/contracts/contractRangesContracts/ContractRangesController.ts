import ContractRangeContractRepository, {
    ContractRangesContractsSearchParams,
} from './ContractRangeContractRepository';
import ContractRangeContract from './ContractRangeContract';
import { ContractRangePerContractData } from '../../types/types';

/**
 * Controller dla asocjacji ContractRange-Contract
 * Wzorzec: Singleton + static methods
 * Przepływ: Router → Controller → Repository → Model
 */
export default class ContractRangesContractsController {
    private static instance: ContractRangesContractsController;
    private repository: ContractRangeContractRepository;

    private constructor() {
        this.repository = new ContractRangeContractRepository();
    }

    private static getInstance(): ContractRangesContractsController {
        if (!this.instance) {
            this.instance = new ContractRangesContractsController();
        }
        return this.instance;
    }

    /**
     * Wyszukuje asocjacje ContractRange-Contract
     * @param orConditions - tablica warunków wyszukiwania łączonych przez OR
     */
    static async find(
        orConditions: ContractRangesContractsSearchParams[] = []
    ): Promise<ContractRangeContract[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    /**
     * @deprecated Użyj find() zamiast getContractRangesContractsList()
     * Zachowane dla kompatybilności wstecznej
     */
    static async getContractRangesContractsList(
        orConditions: ContractRangesContractsSearchParams[] = []
    ): Promise<ContractRangePerContractData[]> {
        const results = await this.find(orConditions);
        return this.mapToData(results);
    }

    /**
     * Dodaje nową asocjację ContractRange-Contract z DTO
     * @param dto - dane z żądania HTTP
     */
    static async addFromDto(
        dto: ContractRangePerContractData
    ): Promise<ContractRangeContract> {
        const instance = this.getInstance();
        const contractRangeContract = new ContractRangeContract(dto);
        await instance.repository.addInDb(contractRangeContract);
        // Odtwórz id - jest usuwane w addInDb()
        contractRangeContract.id =
            '' +
            contractRangeContract.contractRangeId +
            contractRangeContract.contractId;
        return contractRangeContract;
    }

    /**
     * Dodaje asocjację (wewnętrzne/testy)
     * @param item - instancja ContractRangeContract
     */
    static async add(
        item: ContractRangeContract
    ): Promise<ContractRangeContract> {
        const instance = this.getInstance();
        await instance.repository.addInDb(item);
        // Odtwórz id - jest usuwane w addInDb()
        item.id = '' + item.contractRangeId + item.contractId;
        return item;
    }

    /**
     * Edytuje asocjację ContractRange-Contract z DTO
     * @param dto - dane z żądania HTTP
     */
    static async editFromDto(
        dto: ContractRangePerContractData
    ): Promise<ContractRangeContract> {
        const instance = this.getInstance();
        const contractRangeContract = new ContractRangeContract(dto);
        await instance.repository.editInDb(contractRangeContract);
        return contractRangeContract;
    }

    /**
     * Edytuje asocjację (wewnętrzne/testy)
     * @param item - instancja ContractRangeContract
     */
    static async edit(
        item: ContractRangeContract
    ): Promise<ContractRangeContract> {
        const instance = this.getInstance();
        await instance.repository.editInDb(item);
        return item;
    }

    /**
     * Usuwa asocjację ContractRange-Contract z DTO
     * @param dto - dane z żądania HTTP
     */
    static async deleteFromDto(
        dto: ContractRangePerContractData
    ): Promise<ContractRangeContract> {
        const instance = this.getInstance();
        const contractRangeContract = new ContractRangeContract(dto);
        await instance.repository.deleteFromDb(contractRangeContract);
        return contractRangeContract;
    }

    /**
     * Usuwa asocjację (wewnętrzne/testy)
     * @param item - instancja ContractRangeContract
     */
    static async delete(item: ContractRangeContract): Promise<void> {
        const instance = this.getInstance();
        await instance.repository.deleteFromDb(item);
    }

    /**
     * Mapuje tablicę ContractRangeContract na ContractRangePerContractData
     * (dla kompatybilności z istniejącym kodem)
     */
    private static mapToData(
        items: ContractRangeContract[]
    ): ContractRangePerContractData[] {
        return items.map((item) => ({
            contractRangeId: item.contractRangeId,
            contractId: item.contractId,
            associationComment: item.associationComment,
            _contractRange: item._contractRange,
            _contract: item._contract,
        }));
    }
}
