import BaseController from '../../controllers/BaseController';
import ScrumboardContractStatus from './ScrumboardContractStatus';
import ScrumboardContractStatusRepository, {
    ScrumboardContractStatusSearchParams,
} from './ScrumboardContractStatusRepository';

/** Kontroler flag "Omówiony na planowaniu". Prosty przypadek — bez Google API. */
export default class ScrumboardContractStatusesController extends BaseController<
    ScrumboardContractStatus,
    ScrumboardContractStatusRepository
> {
    private static instance: ScrumboardContractStatusesController;

    constructor() {
        super(new ScrumboardContractStatusRepository());
    }

    private static getInstance(): ScrumboardContractStatusesController {
        if (!this.instance)
            this.instance = new ScrumboardContractStatusesController();
        return this.instance;
    }

    static async find(
        searchParams: ScrumboardContractStatusSearchParams = {}
    ): Promise<ScrumboardContractStatus[]> {
        return this.getInstance().repository.find(searchParams);
    }

    static async setDiscussed(
        contractId: number,
        discussed: boolean,
        personId?: number | null
    ): Promise<ScrumboardContractStatus> {
        return this.getInstance().repository.setDiscussed(
            contractId,
            discussed,
            personId
        );
    }

    static async resetAll(): Promise<void> {
        return this.getInstance().repository.resetAll();
    }
}
