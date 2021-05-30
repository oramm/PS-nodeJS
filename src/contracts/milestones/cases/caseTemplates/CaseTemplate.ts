import BusinessObject from '../../../../BussinesObject';

export default class CaseTemplate extends BusinessObject {
    id?: number;
    name: string;
    description: string;
    templateComment: string;
    _caseType: any;
    caseTypeId: number;



    constructor(initParamObject: any) {
        super({ _dbTableName: 'CaseTemplates' });
        this.id = initParamObject.id;
        this.templateComment = initParamObject.templateComment;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this._caseType = initParamObject._caseType;
        this.caseTypeId = initParamObject._caseType.id;
    }
}

