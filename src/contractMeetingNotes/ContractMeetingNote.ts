import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';

export type ContractMeetingNoteModelData = {
    id?: number;
    contractId: number;
    meetingId?: number | null;
    sequenceNumber: number;
    title: string;
    description?: string | null;
    meetingDate?: string | null;
    protocolGdId?: string | null;
    createdByPersonId?: number | null;
    _contract?: {
        id?: number;
        number?: string;
        name?: string;
    };
    _createdBy?: {
        id?: number;
        name?: string;
        surname?: string;
        email?: string;
    };
    _lastUpdated?: string;
};

export default class ContractMeetingNote {
    id?: number;
    contractId: number;
    meetingId?: number | null;
    sequenceNumber: number;
    title: string;
    description: string | null;
    meetingDate?: string;
    protocolGdId?: string | null;
    _documentEditUrl?: string;
    createdByPersonId?: number | null;
    _contract?: {
        id?: number;
        number?: string;
        name?: string;
    };
    _createdBy?: {
        id?: number;
        name?: string;
        surname?: string;
        email?: string;
    };
    _lastUpdated?: string;

    constructor(initParamObject: ContractMeetingNoteModelData) {
        this.id = initParamObject.id;
        this.contractId = initParamObject.contractId;
        this.meetingId = initParamObject.meetingId ?? null;
        this.sequenceNumber = initParamObject.sequenceNumber;
        this.title = initParamObject.title;
        this.description = initParamObject.description ?? null;
        this.meetingDate = initParamObject.meetingDate
            ? ToolsDate.dateJsToSql(initParamObject.meetingDate)
            : undefined;
        this.createdByPersonId = initParamObject.createdByPersonId ?? null;
        this._contract = initParamObject._contract;
        this._createdBy = initParamObject._createdBy;
        this._lastUpdated = initParamObject._lastUpdated;

        this.setProtocolGdId(initParamObject.protocolGdId ?? null);
    }

    setProtocolGdId(protocolGdId: string | null) {
        this.protocolGdId = protocolGdId;
        this._documentEditUrl = protocolGdId
            ? ToolsGd.createDocumentEditUrl(ToolsDb.sqlToString(protocolGdId))
            : undefined;
    }
}
