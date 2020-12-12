import ToolsDate from "../../tools/ToolsDate";

export default class MeetingArrangement {
    id?: number;
    name: any;
    description: any;
    deadline: string | undefined;
    _owner: any;
    ownerId: number;
    _parent: any;
    meetingId: number;
    _case: any;
    caseId: number;
    _lastUpdated: any;

    constructor(initParamObject: any) {
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;

        this.deadline = ToolsDate.dateJsToSql(initParamObject.deadline);
        this._owner = initParamObject._owner;
        this.ownerId = initParamObject._owner.id;
        this._owner._nameSurnameEmail = this._owner.name + ' ' + this._owner.surname + ' ' + this._owner.email;

        this._parent = initParamObject._parent;
        this.meetingId = initParamObject._parent.id;

        this._case = initParamObject._case;
        this.caseId = initParamObject._case.id;
        this._lastUpdated = initParamObject._lastUpdated;
    }
}

