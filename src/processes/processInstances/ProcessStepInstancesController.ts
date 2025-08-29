import ProcessStepInstance from './ProcessStepInstance';
import BaseController from '../../controllers/BaseController';
import ProcessStepInstanceRepository from './ProcessStepInstanceRepository';

export default class ProcessStepInstancesController extends BaseController<
    ProcessStepInstance,
    ProcessStepInstanceRepository
>{
    private static _instance: ProcessStepInstancesController;

    private constructor() {
        super(new ProcessStepInstanceRepository());
    }

    public static getInstance(): ProcessStepInstancesController {
        if (!this._instance) {
            this._instance = new ProcessStepInstancesController();
        }
        return this._instance;
    }

    static async find(
        initParamObject: any
    ): Promise<ProcessStepInstance[]> {
        const instance = this.getInstance();
        return instance.repository.find(initParamObject);
    }
}
