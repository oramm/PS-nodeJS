import BusinessObject from '../../../../../BussinesObject';
import Process from '../../../../../processes/Process';
import CaseTemplate from '../../caseTemplates/CaseTemplate';
import CaseType from '../../caseTypes/CaseType';

export default class TasksTemplateForProcess extends BusinessObject {
    id?: number;
    name: string;
    description: string;
    deadlineRule: string;
    _caseTemplate?: CaseTemplate;
    caseTemplateId?: number;
    _caseType?: CaseType;
    caseTypeId?: number;
    _process?: Process;
    processId?: number;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'TaskTemplatesForProcesses' });
        this.id = initParamObject.id;
        //this.templateComment = initParamObject.templateComment;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.deadlineRule = initParamObject.deadlineRule;
        //używane przy zadaniach przypisanych do procesu
        if (initParamObject._caseType) {
            this._caseType = initParamObject._caseType;
            this.caseTypeId = initParamObject._caseTypeid;
        }
        //używane przy zadaniach przypisanych do procesu
        if (initParamObject._process) {
            this._process = initParamObject._process;
            this.processId = initParamObject._process.id;
        }
    }
}

