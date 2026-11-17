import ProcessInstance from './ProcessInstance';
import ProcessInstanceRepository from './ProcessInstanceRepository';
import BaseController from '../../controllers/BaseController';
import mysql from 'mysql2/promise';
import ProcessStepsController from '../ProcessStepsController';
import ProcessStepInstance from './ProcessStepInstance';
import ProcessStepInstanceRepository from './ProcessStepInstanceRepository';
import Guard from '../../contracts/milestones/consolidation/ConsolidationWriteGuardController';
import GuardValidator from '../../contracts/milestones/consolidation/ConsolidationWriteGuardValidator';

export type ProcessInstanceDto = {
    id?: number;
    editorId?: number;
    _editor?: { id: number };
    _case: { id: number };
    _task: { id: number };
    _process: { id: number };
    _stepsInstances?: any[];
};

export default class ProcessInstancesController extends BaseController<
    ProcessInstance,
    ProcessInstanceRepository
> {
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

    static async find(initParamObject: any = {}): Promise<ProcessInstance[]> {
        const instance = this.getInstance();
        return instance.repository.find(initParamObject);
    }

    static async addFromDto(
        dto: ProcessInstanceDto,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction: boolean = false
    ): Promise<ProcessInstance> {
        const processInstance = new ProcessInstance(dto);
        return await this.addNewProcessStepsInstances(
            processInstance,
            externalConn,
            isPartOfTransaction
        );
    }

    static async add(
        processInstance: ProcessInstance,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction: boolean = false
    ): Promise<ProcessInstance> {
        GuardValidator.standalone(externalConn, isPartOfTransaction);
        return Guard.processes([], [processInstance.caseId], processInstance.taskId == null ? [] : [processInstance.taskId], async conn => {
            await this.getInstance().repository.addInDb(processInstance, conn, true);
            return processInstance;
        });
    }

    static async editFromDto(
        dto: ProcessInstanceDto,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction: boolean = false,
        fieldsToUpdate?: string[]
    ): Promise<ProcessInstance> {
        const processInstance = new ProcessInstance(dto);
        return await this.edit(
            processInstance,
            externalConn,
            isPartOfTransaction,
            fieldsToUpdate
        );
    }

    static async edit(
        processInstance: ProcessInstance,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction: boolean = false,
        fieldsToUpdate?: string[]
    ): Promise<ProcessInstance> {
        GuardValidator.standalone(externalConn, isPartOfTransaction);
        const caseIds = processInstance.caseId !== undefined && (!fieldsToUpdate?.length || fieldsToUpdate.includes('caseId'))
            ? [processInstance.caseId] : [];
        const taskIds = processInstance.taskId != null && (!fieldsToUpdate?.length || fieldsToUpdate.includes('taskId'))
            ? [processInstance.taskId] : [];
        return Guard.processes([processInstance.id], caseIds, taskIds, async conn => {
            await this.getInstance().repository.editInDb(processInstance, conn, true, fieldsToUpdate);
            return processInstance;
        });
    }

    static async delete(
        processInstance: ProcessInstance,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction: boolean = false
    ): Promise<void> {
        GuardValidator.standalone(externalConn, isPartOfTransaction);
        await Guard.processes([processInstance.id], [], [], conn =>
            this.getInstance().repository.deleteFromDb(processInstance, conn, true));
    }

    /**
     * Creates a process instance and its default step instances.
     *
     * Owns the lifecycle lock and DB-only transaction for the process and all steps.
     * External transactions require a separate ownership-aware integration.
     */
    static async addNewProcessStepsInstances(
        processInstance: ProcessInstance,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction: boolean = false
    ): Promise<ProcessInstance> {
        GuardValidator.standalone(externalConn, isPartOfTransaction);
        const steps = await Guard.processes([], [processInstance.caseId], processInstance.taskId == null ? [] : [processInstance.taskId], async conn => {
            await this.getInstance().repository.addInDb(processInstance, conn, true);
            const processSteps = await ProcessStepsController.find({ processId: processInstance.processId });
            const created: ProcessStepInstance[] = [];
            const stepRepository = new ProcessStepInstanceRepository();
            for (const processStep of processSteps) {
                const stepInstance = new ProcessStepInstance({
                    processInstanceId: processInstance.id,
                    _processStep: { id: processStep.id, name: processStep.name, description: processStep.description },
                    _case: processInstance._case,
                    editorId: processInstance.editorId,
                });
                await stepRepository.addInDb(stepInstance, conn, true);
                created.push(stepInstance);
            }
            return created;
        });
        processInstance._stepsInstances.push(...steps);
        return processInstance;
    }
}
