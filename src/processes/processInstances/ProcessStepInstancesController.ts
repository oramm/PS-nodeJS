import ProcessStepInstance from './ProcessStepInstance';
import BaseController from '../../controllers/BaseController';
import ProcessStepInstanceRepository from './ProcessStepInstanceRepository';
import mysql from 'mysql2/promise';

export default class ProcessStepInstancesController extends BaseController<
    ProcessStepInstance,
    ProcessStepInstanceRepository
> {
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

    static async find(initParamObject: any): Promise<ProcessStepInstance[]> {
        const instance = this.getInstance();
        return instance.repository.find(initParamObject);
    }

    static async add(
        stepInstance: ProcessStepInstance,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<ProcessStepInstance> {
        const instance = this.getInstance();
        await instance.repository.addInDb(
            stepInstance,
            externalConn,
            isPartOfTransaction
        );
        return stepInstance;
    }
}
