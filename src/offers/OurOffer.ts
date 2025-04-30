import Offer from './Offer';
import { OAuth2Client } from 'google-auth-library';
import {
    OfferEventData,
    OfferInvitationMailToProcessData,
    OurOfferData,
    PersonData,
} from '../types/types';
import OurOfferGdFile from './OurOfferGdFIle';
import EnviErrors from '../tools/Errors';
import Setup from '../setup/Setup';
import ToolsGd from '../tools/ToolsGd';
import OfferEvent from './offerEvent/OfferEvent';
import { UserData } from '../types/sessionTypes';
import PersonsController from '../persons/PersonsController';
import ToolsDb from '../tools/ToolsDb';
import OfferInvitationMail from './OfferInvitationMails/OfferInvitationMail';

export default class OurOffer extends Offer implements OurOfferData {
    gdDocumentId?: string;
    _documentOpenUrl?: string;
    resourcesGdFolderId?: string;
    invitationMailId?: number | null;
    _invitationMail?: OfferInvitationMailToProcessData;
    constructor(initParamObject: OurOfferData) {
        super(initParamObject);
        this.resourcesGdFolderId = initParamObject.resourcesGdFolderId;
        this._invitationMail = initParamObject._invitationMail;
        this.invitationMailId =
            initParamObject.invitationMailId ||
            initParamObject._invitationMail?.id;
        if (initParamObject.gdDocumentId) {
            this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(
                initParamObject.gdDocumentId
            );
            this.gdDocumentId = initParamObject.gdDocumentId;
        }
    }

    async addNewController(
        auth: OAuth2Client,
        userData: UserData,
        taskId: string
    ) {
        await super.addNewController(auth, userData, taskId);
        await this.bindInvitationMail(userData);
        const ourOfferGdFile = new OurOfferGdFile({
            enviDocumentData: { ...this },
        });
        await ourOfferGdFile.moveToMakeOfferFolder(auth);
    }

    protected async bindInvitationMail(userData: UserData) {
        if (this._invitationMail === undefined) return;
        const invitationMail = new OfferInvitationMail({
            ...this._invitationMail,
            _ourOfferId: this.id,
            status: Setup.OfferInvitationMailStatus.DONE,
        });
        await invitationMail.editController(userData);
    }

    /** Kasuje invitationMailId ustawia status maila na NEW */
    protected async unbindInvitationMail(userData: UserData) {
        if (!this._invitationMail || !this._invitationMail.id) return;
        const invitationMail = new OfferInvitationMail({
            ...this._invitationMail,
            status: Setup.OfferInvitationMailStatus.NEW,
        });
        await invitationMail.editController(userData);
        this.invitationMailId = null;
        this._invitationMail = undefined;
    }

    async deleteController(auth: OAuth2Client, userData: UserData) {
        await ToolsDb.transaction(async () => {
            this.unbindInvitationMail(userData);
            super.deleteController(auth);
        });
    }

    async sendOfferController(
        auth: OAuth2Client,
        userData: UserData,
        newEventData: OfferEventData
    ) {
        const _editor = await PersonsController.getPersonFromSessionUserData(
            userData
        );

        const newEvent = new OfferEvent({
            ...newEventData,
            eventType: Setup.OfferEventType.SENT,
            _editor, //editorId: ustawia się w BussinesObject,
            offerId: this.id,
        });
        await newEvent.addNewController();
        newEvent.sendMailWithOffer(auth, this, [userData.systemEmail]);
        this._lastEvent = newEvent;
        this.status = Setup.OfferStatus.DONE;
        await this.editController(auth, undefined, ['status']);
    }

    async createGdElements(auth: OAuth2Client) {
        await super.createGdElements(auth).catch((error) => {
            throw error;
        });
        console.log('Tworzenie pliku oferty');
        const offerGdFile = await this.createOfferFile(auth).catch((error) => {
            throw error;
        });
        if (!offerGdFile.documentId) throw new EnviErrors.NoGdIdError();
        this.gdDocumentId = offerGdFile.documentId;
        this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(
            this.gdDocumentId
        );
    }

    /** Tworzy plik z dokumentem i ustawia this.gdDocumentId */
    private async createOfferFile(auth: OAuth2Client) {
        const ourOfferGdFile = new OurOfferGdFile({
            enviDocumentData: { ...this },
        });
        const document = await ourOfferGdFile.create(auth);
        await ourOfferGdFile.updateTextRunsInNamedRanges(auth);
        if (!document.documentId) throw new EnviErrors.NoGdIdError();
        this.gdDocumentId = document.documentId;
        return document;
    }

    async exportToPDF(auth: OAuth2Client) {
        if (!this.gdDocumentId) throw new EnviErrors.NoGdIdError();
        await ToolsGd.exportDocToPdfAndUpload(auth, this.gdDocumentId);
    }

    async editGdElements(auth: OAuth2Client, taskId: string) {
        const ourOfferGdFile = new OurOfferGdFile({
            enviDocumentData: { ...this },
        });

        const [letterGdFolder, _, _1] = await Promise.all([
            super.editGdElements(auth),
            ourOfferGdFile.edit(auth),
            ourOfferGdFile.editFileName(auth),
        ]);
        return letterGdFolder;
    }

    async getCurrentOfferVersionNumber(offerId: number) {
        const sql = `SELECT MAX(VersionNumber) as VersionNumber
        FROM OfferEvents
        WHERE OfferId = ?`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        return result[0].VersionNumber;
    }
}
