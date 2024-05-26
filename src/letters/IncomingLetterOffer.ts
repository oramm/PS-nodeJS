import {
    ExternalOfferData,
    IncomingLetterOfferData,
    OurOfferData,
} from '../types/types';
import IncomingLetter from './IncomingLetter';
import IncomingLetterOfferGdController from './gdControlers/IncomingLetterOfferGdController';

export default class IncomingLetterOffer
    extends IncomingLetter
    implements IncomingLetterOfferData
{
    _offer: OurOfferData | ExternalOfferData;
    offerId?: number;
    _letterGdController = new IncomingLetterOfferGdController();

    constructor(initParamObject: IncomingLetterOfferData) {
        super(initParamObject);
        this._offer = initParamObject._offer;
        this.offerId = initParamObject._offer.id;
    }

    makeParentFolderGdId(): string {
        if (!this._cases[0].gdFolderId)
            throw new Error('Letter folder gdId is not defined');
        return this._cases[0].gdFolderId;
    }
}
