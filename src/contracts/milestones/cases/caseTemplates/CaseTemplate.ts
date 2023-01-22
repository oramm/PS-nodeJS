import BusinessObject from '../../../../BussinesObject';
import CaseType from '../caseTypes/CaseType';

interface ICaseTemplate {
    id?: number;
    name: string;
    description: string;
    templateComment: string;
    _caseType: CaseType;
    caseTypeId: number;
}

export default class CaseTemplate extends BusinessObject {
    id?: number;
    name: string;
    description: string;
    templateComment: string;
    _caseType: CaseType;
    caseTypeId: number;

    constructor(initParamObject: ICaseTemplate) {
        super({ _dbTableName: 'CaseTemplates' });
        this.id = initParamObject.id;
        this.templateComment = initParamObject.templateComment;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this._caseType = initParamObject._caseType;
        this.caseTypeId = <number>initParamObject._caseType.id;
    }
}