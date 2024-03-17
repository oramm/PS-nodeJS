import {
    ExternalOfferData,
    IncomingLetterOfferData,
    OurOfferData,
} from '../types/types';
import IncomingLetter from './IncomingLetter';

export default class IncomingLetterOffer
    extends IncomingLetter
    implements IncomingLetterOfferData
{
    _offer: OurOfferData | ExternalOfferData;

    constructor(initParamObject: IncomingLetterOfferData) {
        super(initParamObject);
        this._offer = initParamObject._offer;
    }

    makeParentFolderGdId(): string {
        if (!this._cases[0].gdFolderId)
            throw new Error('Letter folder gdId is not defined');
        return this._cases[0].gdFolderId;
    }
}
