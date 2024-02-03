import Offer from './Offer';
import { OAuth2Client } from 'google-auth-library';
import { OurOfferData } from '../types/types';
import OurOfferGdFile from './OurOfferGdFIle';
import EnviErrors from '../tools/Errors';
import { Envi } from '../tools/EnviTypes';
import ToolsGd from '../tools/ToolsGd';

export default class OurOffer extends Offer implements Envi.OfferDocumentData {
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
        const [letterGdFolder, _] = await Promise.all([
            super.editGdElements(auth),
            ourOfferGdFile.edit(auth),
        ]);
        return letterGdFolder;
    }
}
