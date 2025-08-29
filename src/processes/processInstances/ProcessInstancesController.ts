import ProcessInstance from "./ProcessInstance";
import ProcessInstanceRepository from './ProcessInstanceRepository';
import BaseController from '../../controllers/BaseController';
import mysql from 'mysql2/promise';
import ProcessStepsController from '../ProcessStepsController';
import ProcessStepInstance from './ProcessStepInstance';

export default class ProcessInstancesController extends BaseController<
    ProcessInstance,
    ProcessInstanceRepository
>{
    private static instance: ProcessInstancesController;

    constructor() {
        super(new ProcessInstanceRepository());
    }

    private static getInstance(): ProcessInstancesController {
        if (!this.instance) {
            this.instance = new ProcessInstancesController();
        }
        return this.instance;
    }

    static async find(
        initParamObject: any = {}
    ): Promise<ProcessInstance[]> {
        const instance = this.getInstance();
        return instance.repository.find(initParamObject);
    }

    /** Jest odpalana przy każdym utworzeniu Sprawy posiadającej ProcessInstance w funkcji ProcessInstance.addInDb();
     */
    static async addNewProcessStepsInstances(
        instanceData: any,
        externalConn: mysql.PoolConnection,
        isPartOfTransaction: boolean = false
    ): Promise<ProcessInstance> {
        const instance = this.getInstance();
        const processInstance = new ProcessInstance(instanceData);

        await instance.create(processInstance,externalConn,isPartOfTransaction);

        if (!externalConn && isPartOfTransaction)
            throw new Error(
                'Transaction is not possible without external connection'
            );
        const processSteps = await ProcessStepsController.find({
            processId: processInstance.processId,
        });
        let stepInstance
        for (const processStep of processSteps) {
            stepInstance = new ProcessStepInstance({
                processInstanceId: processInstance.id,
                processStepId: processStep.id,
                _processStep: {
                    id: processStep.id,
                    name: processStep.name,
                    description: processStep.description,
                },
                _case: processInstance._case,
                editorId: processInstance.editorId,
            });

            await stepInstance.addInDb(externalConn, isPartOfTransaction);
            processInstance._stepsInstances.push(stepInstance);
        }
        return processInstance;
    }
}