import Risk from './Risk';
import RiskRepository, { RisksSearchParams } from './RiskRepository';
import { ProjectScope } from '../../../../types/sessionTypes';

/**
 * Controller dla Risk - warstwa aplikacji/serwisu
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Orkiestruje operacje (Repository, Model)
 * - NIE pisze zapytań SQL (→ Repository)
 * - NIE zawiera logiki biznesowej (→ Model)
 *
 * UWAGA: Risk nie dziedziczy po BusinessObject - brak operacji CUD
 * Moduł obsługuje tylko odczyt (READ)
 */
export default class RisksController {
    private static instance: RisksController;
    protected repository: RiskRepository;

    constructor() {
        this.repository = new RiskRepository();
    }

    /**
     * Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
     */
    private static getInstance(): RisksController {
        if (!this.instance) {
            this.instance = new RisksController();
        }
        return this.instance;
    }

    // ==================== READ ====================

    /**
     * @deprecated Użyj find() zamiast getRisksList()
     */
    static async getRisksList(
        initParamObject: RisksSearchParams
    ): Promise<Risk[]> {
        return this.find(initParamObject);
    }

    /**
     * Wyszukuje ryzyka według parametrów
     * API PUBLICZNE - zgodne z Clean Architecture
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<Risk[]>
     */
    static async find(
        searchParams: RisksSearchParams = {},
        scope?: ProjectScope
    ): Promise<Risk[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams, scope);
    }
}
