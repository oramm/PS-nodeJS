import {
    DocumentTemplateData,
    ExternalOfferData,
    OurLetterOfferData,
    OurOfferData,
} from '../types/types';
import OurLetter from './OurLetter';
import OurLetterOfferGdFile from './OurLetterOfferGdFIle';
import OurLetterOfferGdController from './gdControlers/OurLetterOfferGdController';

export default class OurLetterOffer
    extends OurLetter
    implements OurLetterOfferData
{
    _offer: OurOfferData | ExternalOfferData;
    offerId?: number;
    _letterGdController = new OurLetterOfferGdController();

    constructor(initParamObject: OurLetterOfferData) {
        super(initParamObject);
        this._offer = initParamObject._offer;
        this.offerId = initParamObject._offer.id;
    }

    makeLetterGdFileController(_template?: DocumentTemplateData) {
        return new OurLetterOfferGdFile({
            _template,
            enviDocumentData: { ...this },
        });
    }
}
