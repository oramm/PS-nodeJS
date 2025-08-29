import BusinessObject from '../BussinesObject';

export default class Process extends BusinessObject {
    id?: number;
    name: any;
    description: any;
    _caseType: any;
    caseTypeId: any;
    status?: string;
    _lastUpdated: any;

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'Processes' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;

        this._caseType = initParamObject._caseType;
        this.caseTypeId = initParamObject._caseType.id;

        if (initParamObject.status) this.status = 'ACTIVE';

        this._lastUpdated = initParamObject._lastUpdated;
    }
}
