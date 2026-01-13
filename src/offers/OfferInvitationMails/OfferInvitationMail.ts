import BusinessObject from '../../BussinesObject';
import {
    OfferInvitationMailToProcessData,
    PersonData,
} from '../../types/types';

export default class OfferInvitationMail
    extends BusinessObject
    implements OfferInvitationMailToProcessData
{
    id?: number;
    uid: number;
    subject: string;
    body?: string;
    from: string;
    to: string;
    date: string;
    flags?: Set<string>;
    status: string;
    _ourOfferId?: number;
    _lastUpdated?: string;
    editorId?: number;
    _editor?: PersonData;

    constructor(initParamObject: OfferInvitationMailToProcessData) {
        super({ ...initParamObject, _dbTableName: 'OfferInvitationMails' });

        if (!initParamObject.uid) {
            throw new Error('UID is required for OfferInvitationMail');
        }
        this.uid = initParamObject.uid;
        this.subject = initParamObject.subject;
        this.body = initParamObject.body;
        this.from = initParamObject.from;
        this.to = initParamObject.to;
        this.date = initParamObject.date;
        this.flags = Array.isArray(initParamObject.flags)
            ? new Set(initParamObject.flags)
            : undefined;
        this.status = initParamObject.status;
        this._ourOfferId = initParamObject._ourOfferId;
        this._lastUpdated = initParamObject._lastUpdated;
    }
}
