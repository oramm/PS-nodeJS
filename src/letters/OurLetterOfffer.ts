import OurLetterGdFile from './OurLetterGdFIle';

import {
    DocumentTemplateData,
    ExternalOfferData,
    OurLetterContractData,
    OurLetterOfferData,
    OurOfferData,
    ProjectData,
} from '../types/types';
import OurLetter from './OurLetter';
import OurLetterOfferGdFile from './OurLetterOfferGdFIle';

export default class OurLetterOffer
    extends OurLetter
    implements OurLetterOfferData
{
    _offer: OurOfferData | ExternalOfferData;

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
