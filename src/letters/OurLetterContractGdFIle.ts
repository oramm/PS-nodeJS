import { Envi } from '../tools/Tools';
import {
    CaseData,
    DocumentTemplateData,
    OurLetterContractData,
} from '../types/types';
import OurLetterGdFile from './OurLetterGdFIle';

export default class OurLetterContractGdFile extends OurLetterGdFile {
    protected enviDocumentData: OurLetterContractData;

    constructor(initObjectParameter: {
        _template?: DocumentTemplateData;
        enviDocumentData: OurLetterContractData;
    }) {
        super(initObjectParameter);
        this.enviDocumentData = initObjectParameter.enviDocumentData;
    }

    /**Zwraca listę spraw, kamieni itd */
    protected letterContextLabel() {
        return `projekt: ${
            this.enviDocumentData._project.ourId
        }, ${this.makeCasesList()}`;
    }

    protected makeCasesList(): string {
        const cases = this.enviDocumentData._cases as CaseData[];
        const casesWithcContractId = cases.map((item) => {
            if (!item._parent) throw new Error('Case must have _parent');
            return { ...item, contractId: item._parent.contractId as number };
        });
        const casesByContracts = Envi.ToolsArray.groupBy<
            CaseData & { contractId: number }
        >(casesWithcContractId, 'contractId');

        let casesLabel: string = '';
        for (const contractIdItem in casesByContracts) {
            const currentCase = casesByContracts[contractIdItem][0];
            if (!currentCase._parent?._contract)
                throw new Error('Case must have _parent._contract');

            casesLabel += 'kontrakt: ';
            casesLabel += this.makeContractLabel(currentCase) + ',';
            casesLabel += ' ' + currentCase._parent._contract?.name + ', ';
            casesLabel +=
                casesByContracts[contractIdItem].length > 1
                    ? ' sprawy: '
                    : ' sprawa: ';
            for (const caseItem of casesByContracts[contractIdItem])
                casesLabel +=
                    caseItem._typeFolderNumber_TypeName_Number_Name + ', ';
        }
        return casesLabel.substring(0, casesLabel.length - 2);
    }

    private makeContractLabel(_case: CaseData) {
        if (!_case._parent?._contract)
            throw new Error('Case must have _parent._contract');
        const currentOurId =
            'ourId' in _case._parent?._contract
                ? _case._parent?._contract.ourId
                : undefined;
        return currentOurId || _case._parent._contract?.number;
    }
}
