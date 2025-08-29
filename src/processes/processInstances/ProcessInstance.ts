import BusinessObject from '../../BussinesObject';

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
}