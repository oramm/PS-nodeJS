import BusinessObject from '../../BussinesObject';
import ProcessStepsController from '../ProcessStepsController';
import ProcessStepInstance from './ProcessStepInstance';
import mysql from 'mysql2/promise';

export default class ProcessInstance extends BusinessObject {
    id?: number;
    processId: number;
    caseId: number;
    taskId: number;
    editorId: number;
    _lastUpdated: any;
    _case: any;
    _task: any;
    _process: any;
    _stepsInstances: any[];

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'ProcessInstances' });
        this.id = initParamObject.id;
        this.processId = initParamObject._process.id;

        this.caseId = initParamObject._case.id;
        this.taskId = initParamObject._task.id;
        this.editorId = initParamObject.editorId;

        this._lastUpdated = initParamObject._lastUpdated;

        this._case = initParamObject._case;
        this._task = initParamObject._task;
        this._process = initParamObject._process;
        this._stepsInstances = initParamObject._stepsInstances
            ? initParamObject._stepsInstances
            : [];
    }
    /** Jest odpalana przy każdym utworzeniu Sprawy posiadającej ProcessInstance w funkcji ProcessInstance.addInDb();
     */
    async createProcessStepsInstances(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction: boolean = false
    ) {
        if (!externalConn && isPartOfTransaction)
            throw new Error(
                'Transaction is not possible without external connection'
            );
        const processSteps = await ProcessStepsController.find({
            processId: this.processId,
        });
        let item;
        for (const processStep of processSteps) {
            item = new ProcessStepInstance({
                processInstanceId: this.id,
                processStepId: processStep.id,
                _processStep: {
                    id: processStep.id,
                    name: processStep.name,
                    description: processStep.description,
                },
                _case: this._case,
                editorId: this.editorId,
            });

            await item.addInDb(externalConn, isPartOfTransaction);
            this._stepsInstances.push(item);
        }
        if (item) return item.id;
    }

    async addInDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction: boolean = false
    ) {
        if (!externalConn && isPartOfTransaction)
            throw new Error(
                'Transaction is not possible without external connection'
            );
        await super.addInDb(externalConn, isPartOfTransaction);
        await this.createProcessStepsInstances(
            externalConn,
            isPartOfTransaction
        );
        return this;
    }
}
