import BusinessObject from '../../../../BussinesObject';
import ToolsDate from '../../../../tools/ToolsDate';
import { PersonData, TaskData } from '../../../../types/types';

export default class Task extends BusinessObject {
    id?: number;
    name?: string;
    description?: string;
    deadline?: string | Date | null;
    status?: string;
    estimatedHours?: number | null;
    hoursMon?: number | null;
    hoursTue?: number | null;
    hoursWed?: number | null;
    hoursThu?: number | null;
    hoursFri?: number | null;
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
        // undefined = pole nietknięte (pomijane przy zapisie do DB), null = wyczyszczenie wartości
        if (initParamObject.estimatedHours !== undefined)
            this.estimatedHours = initParamObject.estimatedHours;
        if (initParamObject.hoursMon !== undefined)
            this.hoursMon = initParamObject.hoursMon;
        if (initParamObject.hoursTue !== undefined)
            this.hoursTue = initParamObject.hoursTue;
        if (initParamObject.hoursWed !== undefined)
            this.hoursWed = initParamObject.hoursWed;
        if (initParamObject.hoursThu !== undefined)
            this.hoursThu = initParamObject.hoursThu;
        if (initParamObject.hoursFri !== undefined)
            this.hoursFri = initParamObject.hoursFri;
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
