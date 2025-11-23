import BaseController from '../../../controllers/BaseController';
import MilestoneTemplateRepository, {
    MilestoneTemplatesSearchParams,
} from './MilestoneTemplateRepository';
import MilestoneTemplate from './MilestoneTemplate';

export default class MilestoneTemplatesController extends BaseController<
    MilestoneTemplate,
    MilestoneTemplateRepository
> {
    private static instance: MilestoneTemplatesController;

    constructor() {
        super(new MilestoneTemplateRepository());
    }

    private static getInstance(): MilestoneTemplatesController {
        if (!this.instance) {
            this.instance = new MilestoneTemplatesController();
        }
        return this.instance;
    }

    // ==================== READ ====================

    /**
     * Wyszukuje szablony kamieni milowych
     * API PUBLICZNE - zgodne z Clean Architecture
     * @param searchParams - Parametry wyszukiwania
     * @param templateType - Opcjonalny typ szablonu (CONTRACT | OFFER)
     * @returns Promise<MilestoneTemplate[]>
     */
    static async find(
        searchParams: MilestoneTemplatesSearchParams = {},
        templateType?: 'CONTRACT' | 'OFFER'
    ): Promise<MilestoneTemplate[]> {
        console.log('MilestoneTemplatesController.find()');
        console.log('searchParams', searchParams);
        console.log('templateType', templateType);

        const instance = this.getInstance();

        // Dodaj templateType do searchParams jeśli przekazany
        const params = {
            ...searchParams,
            ...(templateType && { templateType }),
        };

        return await instance.repository.find(params);
    }
}
