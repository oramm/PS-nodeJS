import Offer from './Offer';
import { OAuth2Client } from 'google-auth-library';
import { OfferEventData, OurOfferData, PersonData } from '../types/types';
import OurOfferGdFile from './OurOfferGdFIle';
import EnviErrors from '../tools/Errors';
import Setup from '../setup/Setup';
import ToolsGd from '../tools/ToolsGd';
import OfferEvent from './offerEvent/OfferEvent';
import { UserData } from '../setup/GAuth2/sessionTypes';
import PersonsController from '../persons/PersonsController';
import ToolsDb from '../tools/ToolsDb';

export default class OurOffer extends Offer implements OurOfferData {
    gdDocumentId?: string;
    _documentOpenUrl?: string;
    resourcesGdFolderId?: string;
    constructor(initParamObject: OurOfferData) {
        super(initParamObject);
        this.resourcesGdFolderId = initParamObject.resourcesGdFolderId;
        if (initParamObject.gdDocumentId) {
            this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(
                initParamObject.gdDocumentId
            );
            this.gdDocumentId = initParamObject.gdDocumentId;
        }
    }

    async addNewController(auth: OAuth2Client, userData: UserData) {
        await super.addNewController(auth, userData);
        const ourOfferGdFile = new OurOfferGdFile({
            enviDocumentData: { ...this },
        });
        await ourOfferGdFile.moveToMakeOfferFolder(auth);
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
            eventType: Setup.OfferEventType.SEND,
            _editor, //editorId: ustawia się w BussinesObject,
            offerId: this.id,
            versionNumber:
                this._lastEvent?.versionNumber &&
                this._lastEvent?.versionNumber > 0
                    ? this._lastEvent?.versionNumber + 1
                    : 0,
        });
        await newEvent.addNewController();
        newEvent.sendMailWithOffer(auth, this, [userData.systemEmail]);
        this._lastEvent = newEvent;
        this.status = Setup.OfferStatus.DONE;
        await this.editController(auth, ['status']);
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

    async editGdElements(auth: OAuth2Client) {
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
