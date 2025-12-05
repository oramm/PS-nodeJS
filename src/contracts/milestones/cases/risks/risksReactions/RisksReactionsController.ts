import RiskReactionRepository, {
    RisksReactionsSearchParams,
    RiskReactionData,
} from './RiskReactionRepository';

/**
 * Controller dla RiskReaction - warstwa aplikacji/serwisu
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Orkiestruje operacje (Repository, Model)
 * - NIE pisze zapytań SQL (→ Repository)
 * - NIE zawiera logiki biznesowej (→ Model)
 *
 * UWAGA: Moduł obsługuje tylko odczyt (READ) - reakcje na ryzyka
 */
export default class RisksReactionsController {
    private static instance: RisksReactionsController;
    protected repository: RiskReactionRepository;

    constructor() {
        this.repository = new RiskReactionRepository();
    }

    /**
     * Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
     */
    private static getInstance(): RisksReactionsController {
        if (!this.instance) {
            this.instance = new RisksReactionsController();
        }
        return this.instance;
    }

    // ==================== READ ====================

    /**
     * @deprecated Użyj find() zamiast getRisksReactionsList()
     */
    static async getRisksReactionsList(
        initParamObject: RisksReactionsSearchParams
    ): Promise<RiskReactionData[]> {
        return this.find(initParamObject);
    }

    /**
     * Wyszukuje reakcje na ryzyka według parametrów
     * API PUBLICZNE - zgodne z Clean Architecture
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<RiskReactionData[]>
     */
    static async find(
        searchParams: RisksReactionsSearchParams = {}
    ): Promise<RiskReactionData[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }
}
