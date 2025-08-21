import BusinessObject from '../../../../BussinesObject';
import ToolsDate from '../../../../tools/ToolsDate';
import { PersonData, TaskData } from '../../../../types/types';

export default class Task extends BusinessObject {
    id?: number;
    name?: string;
    description?: string;
    deadline?: string | Date | null;
    status?: string;
    ownerId?: number | null;
    _owner?: PersonData;
    caseId?: number;
    _parent?: any;
    scrumSheetRow?: any;
    ownerName?: string;
    rowStatus?: any;
    sheetRow?: any;
    milestoneId?: number;
    constructor(initParamObject: TaskData) {
        super({ ...initParamObject, _dbTableName: 'Tasks' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        if (initParamObject.deadline)
            this.deadline = ToolsDate.dateJsToSql(initParamObject.deadline);
        else if (initParamObject.deadline === null) this.deadline = null;
        this.status = initParamObject.status;
        if (initParamObject._owner) {
            this.ownerId = initParamObject._owner.id;
            this._owner = initParamObject._owner;
            if (this._owner?.id)
                if (
                    !this._owner.name ||
                    !this._owner.surname ||
                    !this._owner.email
                )
                    throw new Error(
                        "Owner's name, surname and email are required"
                    );
            this._owner._nameSurnameEmail =
                this._owner.name.trim() +
                ' ' +
                this._owner.surname.trim() +
                ': ' +
                this._owner.email.trim();
        }
        if (initParamObject._parent) {
            this.caseId = initParamObject._parent.id;
            this._parent = initParamObject._parent;
        }
    }
}
