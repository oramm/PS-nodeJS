import BaseController from '../../controllers/BaseController';
import {
    CaseData,
    ContractData,
    OfferData,
    ProjectData,
} from '../../types/types';
import LetterCase from './LetterCase';
import LetterCaseRepository, {
    LetterCaseSearchParams as RepoSearchParams,
} from './LetterCaseRepository';

export type LetterCaseSearchParams = {
    _project?: ProjectData;
    projectId?: string;
    contractId?: number;
    _contract?: ContractData;
    offerId?: number;
    _offer?: OfferData;
    letterId?: number;
};

/**
 * Kontroler do zarządzania asocjacjami Letter-Case
 */
export default class LetterCaseAssociationsController extends BaseController<
    LetterCase,
    LetterCaseRepository
> {
    private static instance: LetterCaseAssociationsController;

    private constructor() {
        super(new LetterCaseRepository());
    }

    /**
     * Singleton pattern - pobiera instancję kontrolera
     */
    private static getInstance(): LetterCaseAssociationsController {
        if (!LetterCaseAssociationsController.instance) {
            LetterCaseAssociationsController.instance =
                new LetterCaseAssociationsController();
        }
        return LetterCaseAssociationsController.instance;
    }

    /**
     * Dodaje nową asocjację Letter-Case do bazy danych
     *
     * @param association - asocjacja Letter-Case do dodania
     * @param conn - połączenie do bazy (dla transakcji)
     * @param isPartOfTransaction - czy operacja jest częścią większej transakcji
     */
    static async add(
        association: LetterCase,
        conn: any,
        isPartOfTransaction: boolean = true
    ): Promise<LetterCase> {
        const instance = this.getInstance();
        await instance.repository.addInDb(
            association,
            conn,
            isPartOfTransaction
        );
        return association;
    }

    /**
     * Pobiera listę asocjacji Letter-Case według parametrów wyszukiwania
     */
    static async find(
        searchParams: LetterCaseSearchParams = {}
    ): Promise<LetterCase[]> {
        const instance = this.getInstance();

        // Konwertuj parametry wyszukiwania do formatu akceptowanego przez repository
        const repoSearchParams: RepoSearchParams = {
            projectId: searchParams._project?.ourId || searchParams.projectId,
            contractId: searchParams._contract?.id || searchParams.contractId,
            offerId: searchParams._offer?.id || searchParams.offerId,
            letterId: searchParams.letterId,
        };

        return await instance.repository.find(repoSearchParams);
    }

    /**
     * Sprawy powiązane z pismem — stan zapisany w bazie, nie z payloadu klienta.
     *
     * Używane przy uzgadnianiu skrótów po edycji: sprawa zdejmowana z powiązań
     * nie ma prawa pojawić się w payloadzie, więc jej folder można poznać
     * wyłącznie z bazy.
     */
    static async findCasesByLetterId(letterId: number): Promise<CaseData[]> {
        const associations = await this.find({ letterId });
        return associations.map((association) => association._case as CaseData);
    }
}
