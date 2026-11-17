import ProcessStepInstance from './ProcessStepInstance';
import BaseController from '../../controllers/BaseController';
import ProcessStepInstanceRepository from './ProcessStepInstanceRepository';
import mysql from 'mysql2/promise';
import Guard from '../../contracts/milestones/consolidation/ConsolidationWriteGuardController';
import GuardValidator from '../../contracts/milestones/consolidation/ConsolidationWriteGuardValidator';

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
        GuardValidator.standalone(externalConn, isPartOfTransaction);
        return Guard.processes([stepInstance.processInstanceId], [], [], async conn => {
            await this.getInstance().repository.addInDb(stepInstance, conn, true);
            return stepInstance;
        });
    }
}
