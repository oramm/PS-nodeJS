import ProcessInstance from './ProcessInstance';
import ProcessInstanceRepository from './ProcessInstanceRepository';
import BaseController from '../../controllers/BaseController';
import mysql from 'mysql2/promise';
import ProcessStepsController from '../ProcessStepsController';
import ProcessStepInstance from './ProcessStepInstance';
import ProcessStepInstancesController from './ProcessStepInstancesController';
import ToolsDb from '../../tools/ToolsDb';

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
        const instance = this.getInstance();

        if (!externalConn && isPartOfTransaction) {
            throw new Error(
                'Transaction is not possible without external connection'
            );
        }

        if (externalConn) {
            await instance.repository.addInDb(
                processInstance,
                externalConn,
                isPartOfTransaction
            );
            return processInstance;
        }

        await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await instance.repository.addInDb(processInstance, conn, true);
        });

        return processInstance;
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
        const instance = this.getInstance();

        if (!externalConn && isPartOfTransaction) {
            throw new Error(
                'Transaction is not possible without external connection'
            );
        }

        if (externalConn) {
            await instance.repository.editInDb(
                processInstance,
                externalConn,
                isPartOfTransaction,
                fieldsToUpdate
            );
            return processInstance;
        }

        await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await instance.repository.editInDb(
                processInstance,
                conn,
                true,
                fieldsToUpdate
            );
        });

        return processInstance;
    }

    static async delete(
        processInstance: ProcessInstance,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction: boolean = false
    ): Promise<void> {
        const instance = this.getInstance();

        if (!externalConn && isPartOfTransaction) {
            throw new Error(
                'Transaction is not possible without external connection'
            );
        }

        if (externalConn) {
            await instance.repository.deleteFromDb(
                processInstance,
                externalConn,
                isPartOfTransaction
            );
            return;
        }

        await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await instance.repository.deleteFromDb(processInstance, conn, true);
        });
    }

    /**
     * Tworzy ProcessInstance oraz domyślne ProcessStepInstances dla procesu.
     *
     * - Jeśli przekazano `externalConn` + `isPartOfTransaction=true` → używa istniejącej transakcji.
     * - Jeśli nie przekazano `externalConn` → startuje własną transakcję.
     */
    static async addNewProcessStepsInstances(
        processInstance: ProcessInstance,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction: boolean = false
    ): Promise<ProcessInstance> {
        const instance = this.getInstance();

        if (!externalConn && isPartOfTransaction) {
            throw new Error(
                'Transaction is not possible without external connection'
            );
        }

        const createAll = async (conn: mysql.PoolConnection): Promise<void> => {
            await instance.repository.addInDb(processInstance, conn, true);

            const processSteps = await ProcessStepsController.find({
                processId: processInstance.processId,
            });

            for (const processStep of processSteps) {
                const stepInstance = new ProcessStepInstance({
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

                await ProcessStepInstancesController.add(
                    stepInstance,
                    conn,
                    true
                );
                processInstance._stepsInstances.push(stepInstance);
            }
        };

        if (externalConn) {
            await createAll(externalConn);
            return processInstance;
        }

        await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await createAll(conn);
        });

        return processInstance;
    }
}
