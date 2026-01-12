import { ContractsWithChildren } from './ContractTypes';
import ContractsWithChildrenRepository, {
    ContractsWithChildrenSearchParams,
} from './ContractsWithChildrenRepository';

/**
 * Controller dla ContractsWithChildren - warstwa aplikacji
 *
 * Zgodnie z Clean Architecture:
 * - Orkiestruje wywołania Repository
 * - NIE zawiera zapytań SQL ani logiki mapowania
 * - Eksponuje statyczne metody find() (standard CRUD)
 */
export default class ContractsWithChildrenController {
    private static repository = new ContractsWithChildrenRepository();

    /**
     * Wyszukuje kontrakty z hierarchią (Milestones → Cases → Tasks)
     * STANDARD NAZEWNICTWA: find() zamiast getContractsList()
     *
     * @param orConditions - warunki wyszukiwania (OR groups)
     * @returns Kontrakty z pełną hierarchią dzieci
     */
    static async find(
        orConditions: ContractsWithChildrenSearchParams[] = []
    ): Promise<ContractsWithChildren[]> {
        return await this.repository.find(orConditions);
    }
}
