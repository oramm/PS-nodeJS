import ToolsDate from '../../../../tools/ToolsDate';

export default class Task {
    id?: number;
    name?: string;
    description?: string;
    deadline?: string;
    status?: string;
    ownerId?: number;
    _owner?: any;
    caseId?: number;
    _parent?: any;
    scrumSheetRow?: any;
    ownerName?: string;
    rowStatus?: any;
    sheetRow?: any;
    milestoneId?: number;
    constructor(initParamObject: any) {

        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;

        this.deadline = ToolsDate.dateJsToSql(initParamObject.deadline);

        this.status = initParamObject.status;
        if (initParamObject._owner) {
            this.ownerId = initParamObject._owner.id;
            this._owner = initParamObject._owner;
            if (this._owner.id)
                this._owner._nameSurnameEmail = this._owner.name.trim() + ' ' + this._owner.surname.trim() + ': ' + this._owner.email.trim();
        }
        if (initParamObject._parent) {
            this.caseId = initParamObject._parent.id;
            this._parent = initParamObject._parent;
        }
    }
}

