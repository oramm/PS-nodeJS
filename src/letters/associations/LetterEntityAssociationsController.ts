import BaseController from '../../controllers/BaseController';
import LetterEntity from './LetterEntity';
import LetterEntityRepository, {
    LetterEntitySearchParams as RepoSearchParams,
} from './LetterEntityRepository';

export type LetterEntitySearchParams = {
    projectId?: string;
    contractId?: number;
    milestoneId?: number;
};

/**
 * Kontroler do zarządzania asocjacjami Letter-Entity
 */
export default class LetterEntityAssociationsController extends BaseController<
    LetterEntity,
    LetterEntityRepository
> {
    private static instance: LetterEntityAssociationsController;

    private constructor() {
        super(new LetterEntityRepository());
    }

    /**
     * Singleton pattern - pobiera instancję kontrolera
     */
    static getInstance(): LetterEntityAssociationsController {
        if (!LetterEntityAssociationsController.instance) {
            LetterEntityAssociationsController.instance =
                new LetterEntityAssociationsController();
        }
        return LetterEntityAssociationsController.instance;
    }

    /**
     * Pobiera listę asocjacji Letter-Entity według parametrów wyszukiwania
     * @param initParamObject - Parametry wyszukiwania (projectId, contractId, milestoneId)
     */
    static async getLetterEntityAssociationsList(
        initParamObject?: LetterEntitySearchParams
    ): Promise<LetterEntity[]> {
        const instance = this.getInstance();

        // Konwertuj parametry wyszukiwania do formatu akceptowanego przez repository
        const repoSearchParams: RepoSearchParams = {
            projectId: initParamObject?.projectId,
            contractId: initParamObject?.contractId,
            milestoneId: initParamObject?.milestoneId,
        };

        return await instance.repository.find(repoSearchParams);
    }

    /**
     * @deprecated Użyj repository.find() zamiast tego
     */
    static processLetterEntityAssociationsResult(
        result: any[]
    ): LetterEntity[] {
        console.warn(
            'processLetterEntityAssociationsResult is deprecated. Use repository.find() instead.'
        );
        const instance = this.getInstance();
        return result.map((row) => instance.repository['mapRowToModel'](row));
    }
}
