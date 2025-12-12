import BaseController from '../../../../controllers/BaseController';
import { UserData } from '../../../../types/sessionTypes';
import { MilestoneParentType } from '../../../../types/types';
import MilestoneDate from './MilestoneDate';
import MilestoneDateRepository, {
    MilestoneDatesSearchParams,
} from './MilestoneDateRepository';

/**
 * Controller dla MilestoneDate - warstwa orkiestracji
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseController<MilestoneDate, MilestoneDateRepository>
 * - Orkiestruje operacje biznesowe
 * - Deleguje do Repository dla operacji DB
 */
export default class MilestoneDatesController extends BaseController<
    MilestoneDate,
    MilestoneDateRepository
> {
    private static instance: MilestoneDatesController;

    constructor() {
        super(new MilestoneDateRepository());
    }

    // Singleton pattern
    private static getInstance(): MilestoneDatesController {
        if (!this.instance) {
            this.instance = new MilestoneDatesController();
        }
        return this.instance;
    }

    /**
     * API PUBLICZNE - Pobiera listę MilestoneDates według podanych warunków
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @param parentType - Typ rodzica: 'CONTRACT' lub 'OFFER'
     * @returns Promise<MilestoneDate[]> - Lista znalezionych MilestoneDates
     */
    static async find(
        orConditions: MilestoneDatesSearchParams[] = [],
        parentType: MilestoneParentType = 'CONTRACT'
    ): Promise<MilestoneDate[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions, parentType);
    }

    /**
     * API PUBLICZNE - Edytuje MilestoneDate
     *
     * @param milestoneDate - MilestoneDate do edycji
     * @param userData - Dane użytkownika z sesji
     * @param fieldsToUpdate - Opcjonalna lista pól do aktualizacji
     * @returns Zaktualizowany MilestoneDate
     */
    static async edit(
        milestoneDate: MilestoneDate,
        userData?: UserData,
        fieldsToUpdate?: string[]
    ): Promise<MilestoneDate> {
        const instance = this.getInstance();
        await instance.repository.editInDb(
            milestoneDate,
            undefined,
            false,
            fieldsToUpdate
        );
        return milestoneDate;
    }

    /**
     * API PUBLICZNE - Usuwa MilestoneDate
     *
     * @param milestoneDate - MilestoneDate do usunięcia
     * @param userData - Dane użytkownika z sesji
     */
    static async delete(
        milestoneDate: MilestoneDate,
        userData?: UserData
    ): Promise<void> {
        const instance = this.getInstance();
        await instance.repository.deleteFromDb(milestoneDate);
    }
}
