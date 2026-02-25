import BusinessObject from '../../BussinesObject';
import ToolsDate from '../../tools/ToolsDate';
import { MeetingArrangementStatus } from '../../types/types';

export interface MeetingArrangementData {
    id?: number;
    name?: string;
    description?: string;
    deadline?: string | null;
    status?: MeetingArrangementStatus;
    _owner?: {
        id?: number;
        name?: string;
        surname?: string;
        email?: string;
    };
    _parent?: {
        id?: number;
    };
    _case?: {
        id?: number;
        name?: string;
        _type?: {
            id?: number;
            name?: string;
            folderNumber?: string;
        };
        _parent?: {
            id?: number;
            name?: string;
            _parent?: {
                id?: number;
                name?: string;
                number?: string;
            };
        };
    };
    _lastUpdated?: string;
    _editor?: any;
}

export default class MeetingArrangement
    extends BusinessObject
    implements MeetingArrangementData
{
    declare id?: number;
    name?: string;
    description?: string;
    deadline?: string | null;
    status: MeetingArrangementStatus;
    _owner?: {
        id?: number;
        name?: string;
        surname?: string;
        email?: string;
        _nameSurnameEmail?: string;
    };
    ownerId?: number;
    _parent?: {
        id?: number;
    };
    meetingId?: number;
    _case?: MeetingArrangementData['_case'];
    caseId?: number;
    _lastUpdated?: string;

    constructor(initParamObject: MeetingArrangementData) {
        super({ _dbTableName: 'MeetingArrangements', ...initParamObject });

        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.status = initParamObject.status ?? 'PLANNED';

        this.deadline = initParamObject.deadline
            ? ToolsDate.dateJsToSql(initParamObject.deadline)
            : null;

        this._owner = initParamObject._owner;
        this.ownerId = initParamObject._owner?.id;
        if (this._owner && this._owner.name && this._owner.surname) {
            this._owner._nameSurnameEmail = `${this._owner.name} ${
                this._owner.surname
            } ${this._owner.email || ''}`.trim();
        }

        this._parent = initParamObject._parent;
        this.meetingId = initParamObject._parent?.id;

        this._case = initParamObject._case;
        this.caseId = initParamObject._case?.id;

        this._lastUpdated = initParamObject._lastUpdated;
    }
}
