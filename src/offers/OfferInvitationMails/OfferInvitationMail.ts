import BusinessObject from '../../BussinesObject';
import PersonsController from '../../persons/PersonsController';
import { UserData } from '../../types/sessionTypes';
import Setup from '../../setup/Setup';
import ToolsMail from '../../tools/ToolsMail';
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

    /** Dodanie nowego maila do bazy danych */
    async addNewController(userData: UserData) {
        try {
            console.group('Creating new OfferInvitationMail');
            const _editor =
                await PersonsController.getPersonFromSessionUserData(userData);
            this._editor = _editor;
            this.editorId = _editor.id;
            this.status = Setup.OfferInvitationMailStatus.NEW;
            if (!this.body)
                this.body = (await ToolsMail.getEmailDetails(this.uid))?.body;

            await this.addInDb();
            console.log('OfferInvitationMail added to db');
            console.groupEnd();
        } catch (err) {
            console.error('Error adding OfferInvitationMail:', err);
            throw err;
        }
    }

    /** Edycja istniejącego maila */
    async editController(userData: UserData) {
        try {
            console.group('Editing OfferInvitationMail');
            const _editor =
                await PersonsController.getPersonFromSessionUserData(userData);
            this._editor = _editor;
            this.editorId = _editor.id;
            await this.editInDb();
            console.log('OfferInvitationMail edited in db');
            console.groupEnd();
        } catch (err) {
            console.error('Error editing OfferInvitationMail:', err);
            throw err;
        }
    }
}
