import DocumentTemplate from "../documentTemplates/DocumentTemplate";
import OurLetter from "./OurLetter";
import { OAuth2Client } from 'google-auth-library';
import DocumentGdFile from "../documentTemplates/DocumentGdFile";
import { Envi } from "../tools/Tools";
import ToolsDocs from "../tools/ToolsDocs";
import LetterGdController from "./LetterGdController";
import Entity from "../entities/Entity";

export default class OurLetterGdFile extends DocumentGdFile {
    constructor(initObjectParamenter: { _template?: DocumentTemplate, enviDocumentData: OurLetter }) {
        super(initObjectParamenter);
    }

    /** 1. Tworzy plik z szablonu w folderze pisma na GD
     *  2. Tworzy namedRanges z tagów w szablonie
     *   - osobną funkcją w pliku trzeba ustawić namedRages 
     */
    async create(auth: OAuth2Client) {
        let document = await super.create(auth);
        if (!document.documentId) throw new Error('Letter file not created!' + this.enviDocumentData.id);
        const documentId = document.documentId;
        await ToolsDocs.initNamedRangesFromTags(auth, documentId);
        //ToolsDocs.fillNamedRange(gDocument, 'address', this.makeEntitiesDataLabel(<any[]>this.document._entitiesMain));
        //ToolsDocs.fillNamedRange(gDocument, 'description', <string>this.description);
        //projectContextStyle[DocumentApp.Attribute.FONT_SIZE] = 9;
        //projectContextStyle[DocumentApp.Attribute.FOREGROUND_COLOR] = '#666666';
        //ToolsDocs.fillNamedRange(gDocument, 'projectContext', this.projectContext, projectContextStyle);
        this.enviDocumentData.documentGdId = document.documentId;
        return document;
    }

    /** aktualizuje treść NemedRanges */
    async updateTextRunsInNamedRanges(auth: OAuth2Client) {
        const documentId = this.enviDocumentData.documentGdId;
        if (!documentId) throw new Error('Letter file not set!' + this.enviDocumentData.id);
        const newData: { rangeName: string; newText: string; }[] = this.makeDataforNamedRanges();
        await ToolsDocs.updateTextRunsInNamedRanges(auth, documentId, newData);
    }

    /** 1. odświeża namedRanges
     *  2. auktualizuje treść w namedRanges
     */
    async edit(auth: OAuth2Client) {
        const documentId = this.enviDocumentData.documentGdId;
        if (!documentId) throw new Error('Letter file not set!' + this.enviDocumentData.id);
        await ToolsDocs.refreshNamedRangesFromTags(auth, documentId);
        let document = (await ToolsDocs.getDocument(auth, documentId)).data;
        const namedRangesNames = Object.getOwnPropertyNames(document.namedRanges || {});
        if (namedRangesNames.length) console.log('NamedRangesNamesFound %o', namedRangesNames);
        else
            throw new Error('No namedRanges found');

        document = (await ToolsDocs.getDocument(auth, documentId)).data;
        await this.updateTextRunsInNamedRanges(auth);
        return document;
    }

    private makeDataforNamedRanges(): { rangeName: string; newText: string; }[] {
        if (!(this.enviDocumentData.creationDate && this.enviDocumentData.number && this.enviDocumentData.description))
            throw new Error('enviDocumentData creationDate or number or description not found');
        const number = (typeof this.enviDocumentData.number === 'number') ? this.enviDocumentData.number.toString() : this.enviDocumentData.number;
        return [
            { rangeName: 'creationDate', newText: this.enviDocumentData.creationDate },
            { rangeName: 'number', newText: number },
            { rangeName: 'address', newText: this.entitiesDataLabel(<any[]>this.enviDocumentData._entitiesMain) },
            { rangeName: 'description', newText: this.enviDocumentData.description },
            { rangeName: 'projectContext', newText: this.projectContextLabel() },
            { rangeName: 'addressCc', newText: this.addressCcLabel() },
        ];
    }

    private addressCcLabel() {
        if (this.enviDocumentData?._entitiesCc?.length === 0) return '-----';
        return this.entitiesDataLabel(<any[]>this.enviDocumentData._entitiesCc);
    }

    /**Zwraca listę spraw, kamieni itd */
    private projectContextLabel() {
        return `projekt: ${this.enviDocumentData._project.ourId}, ${this.makeCasesList()}`;
    }

    private makeCasesList(): string {
        const cases = this.enviDocumentData._cases.map(item => {
            item.contractId = item._parent.contractId;
            return item;
        })
        let casesByContracts = Envi.ToolsArray.groupBy(cases, 'contractId')
        let casesLabel: string = '';
        for (const contractIdItem in casesByContracts) {
            casesLabel += 'kontrakt: '
            casesLabel += casesByContracts[contractIdItem][0]._parent._parent.ourId || casesByContracts[contractIdItem][0]._parent._parent.number;
            casesLabel += ' ' + casesByContracts[contractIdItem][0]._parent._parent.name + ', ';
            casesLabel += (casesByContracts[contractIdItem].length > 1) ? ' sprawy: ' : ' sprawa: ';
            for (const caseItem of casesByContracts[contractIdItem])
                casesLabel += caseItem._typeFolderNumber_TypeName_Number_Name + ', '
        }
        return casesLabel.substring(0, casesLabel.length - 2);
    }

    /** tworzy etykietę z danymi address */
    private entitiesDataLabel(entities: Entity[]) {
        let label = '';
        for (let i = 0; i < entities.length; i++) {
            label += entities[i].name
            if (entities[i].address)
                label += '\n' + entities[i].address;
            if (i < entities.length - 1)
                label += '\n'
        }
        return label;
    }
}