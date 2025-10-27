import BaseController from '../../controllers/BaseController';
import { ContractData, OfferData, ProjectData } from '../../types/types';
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
    static getInstance(): LetterCaseAssociationsController {
        if (!LetterCaseAssociationsController.instance) {
            LetterCaseAssociationsController.instance =
                new LetterCaseAssociationsController();
        }
        return LetterCaseAssociationsController.instance;
    }

    /**
     * Pobiera listę asocjacji Letter-Case według parametrów wyszukiwania
     */
    static async getLetterCaseAssociationsList(
        searchParams: LetterCaseSearchParams = {}
    ): Promise<LetterCase[]> {
        const instance = this.getInstance();

        // Konwertuj parametry wyszukiwania do formatu akceptowanego przez repository
        const repoSearchParams: RepoSearchParams = {
            projectId: searchParams._project?.ourId || searchParams.projectId,
            contractId: searchParams._contract?.id || searchParams.contractId,
            offerId: searchParams._offer?.id || searchParams.offerId,
        };

        return await instance.repository.find(repoSearchParams);
    }

    /**
     * @deprecated Użyj repository.find() zamiast tego
     */
    static processLetterCaseAssociationsResult(result: any[]) {
        console.warn(
            'processLetterCaseAssociationsResult is deprecated. Use repository.find() instead.'
        );
        const instance = this.getInstance();
        return result.map((row) => instance.repository['mapRowToModel'](row));
    }
}
