import BusinessObject from '../../../../../BussinesObject';

export default class TaskTemplate extends BusinessObject {
    id?: number;
    name: string;
    description: string;
    deadlineRule: string;
    status: string;
    _caseTemplate?: any;
    caseTemplateId?: number;




    constructor(initParamObject: any) {
        super({ _dbTableName: 'TaskTemplates' });
        this.id = initParamObject.id;
        //this.templateComment = initParamObject.templateComment;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.deadlineRule = initParamObject.deadlineRule;
        this.status = initParamObject.status;
        //używane przy zadaniach defaultowych
        if (initParamObject._caseTemplate) {
            this._caseTemplate = initParamObject._caseTemplate;
            this.caseTemplateId = initParamObject._caseTemplate.id;
        }
    }
}

