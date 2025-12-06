import MeetingRepository, { MeetingSearchParams } from './MeetingRepository';
import Meeting from './Meeting';
import BaseController from '../controllers/BaseController';

/**
 * Controller dla Meeting - warstwa orkiestracji
 *
 * Zgodnie z Clean Architecture:
 * - Orkiestruje operacje biznesowe
 * - Deleguje do Repository dla operacji DB
 * - NIE zawiera SQL ani logiki mapowania
 */
export default class MeetingsController extends BaseController<
    Meeting,
    MeetingRepository
> {
    private static instance: MeetingsController;

    constructor() {
        super(new MeetingRepository());
    }

    /**
     * Singleton pattern
     */
    private static getInstance(): MeetingsController {
        if (!this.instance) {
            this.instance = new MeetingsController();
        }
        return this.instance;
    }

    /**
     * Wyszukuje spotkania według podanych warunków
     *
     * REFAKTORING: SQL przeniesiony do MeetingRepository
     * Controller tylko orkiestruje wywołanie Repository
     *
     * @param orConditions - Warunki wyszukiwania (projectId, contractId)
     * @returns Promise<Meeting[]> - Lista znalezionych spotkań
     */
    static async find(
        orConditions: MeetingSearchParams[] = []
    ): Promise<Meeting[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }
}
