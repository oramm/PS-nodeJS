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

    /**
     * Create SENT event for this offer
     * BUSINESS LOGIC: Creates OfferEvent with SENT type
     */
    createSentEvent(
        newEventData: OfferEventData,
        editor: PersonData
    ): OfferEvent {
        return new OfferEvent({
            ...newEventData,
            eventType: Setup.OfferEventType.SENT,
            _editor: editor,
            offerId: this.id,
        });
    }

    /**
     * Mark offer as sent
     * BUSINESS LOGIC: Updates offer status and lastEvent
     */
    markAsSent(event: OfferEvent): void {
        this._lastEvent = event;
        this.status = Setup.OfferStatus.DONE;
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
