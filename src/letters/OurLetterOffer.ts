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
    _letterGdController = new OurLetterOfferGdController();

    constructor(initParamObject: OurLetterOfferData) {
        super(initParamObject);
        this._offer = initParamObject._offer;
    }

    makeLetterGdFileController(_template?: DocumentTemplateData) {
        return new OurLetterOfferGdFile({
            _template,
            enviDocumentData: { ...this },
        });
    }
}
