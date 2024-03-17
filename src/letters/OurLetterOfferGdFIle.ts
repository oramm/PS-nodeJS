import { Envi } from '../tools/Tools';
import {
    CaseData,
    DocumentTemplateData,
    OurLetterContractData,
    OurLetterOfferData,
} from '../types/types';
import OurLetterGdFile from './OurLetterGdFIle';

export default class OurLetterOfferGdFile extends OurLetterGdFile {
    protected enviDocumentData: OurLetterOfferData;

    constructor(initObjectParameter: {
        _template?: DocumentTemplateData;
        enviDocumentData: OurLetterOfferData;
    }) {
        super(initObjectParameter);
        this.enviDocumentData = initObjectParameter.enviDocumentData;
    }

    /**Zwraca listę spraw, kamieni itd */
    protected letterContextLabel() {
        return `oferta: ${
            this.enviDocumentData._offer.description
        }, ${this.makeCasesList()}`;
    }

    protected makeCasesList(): string {
        //pismo może dotyczyć tylko jednej oferty
        const cases = this.enviDocumentData._cases as CaseData[];
        let casesLabel: string = `oferta: ${this.enviDocumentData._offer.description}, sprawy: `;

        for (const caseItem of cases) {
            if (!caseItem._parent?._offer)
                throw new Error('Case must have _parent._offer');
            casesLabel +=
                caseItem._typeFolderNumber_TypeName_Number_Name + ', ';
        }
        return casesLabel.substring(0, casesLabel.length - 2);
    }
}
