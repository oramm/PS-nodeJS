import { OAuth2Client } from 'google-auth-library';
import DocumentGdFile from '../documentTemplates/DocumentGdFile';
import ToolsDocs from '../tools/ToolsDocs';
import {
    CaseData,
    DocumentTemplateData,
    EntityData,
    OurLetterData,
} from '../types/types';

export default abstract class OurLetterGdFile extends DocumentGdFile {
    protected enviDocumentData: OurLetterData;

    constructor(initObjectParamenter: {
        _template?: DocumentTemplateData;
        enviDocumentData: OurLetterData;
    }) {
        super(initObjectParamenter);
        if (!initObjectParamenter.enviDocumentData._entitiesMain)
            throw new Error('enviDocumentData._entitiesMain not found');

        this.enviDocumentData = initObjectParamenter.enviDocumentData;
    }

    /** 1. Tworzy plik z szablonu w folderze pisma na GD
     *  2. Tworzy namedRanges z tagów w szablonie
     *   - osobną funkcją w pliku trzeba ustawić namedRages
     */
    async create(auth: OAuth2Client) {
        let document = await super.create(auth);
        if (!document.documentId)
            throw new Error(
                'Letter file not created!' + this.enviDocumentData.id
            );
        const documentId = document.documentId;
        await ToolsDocs.initNamedRangesFromTags(auth, documentId);
        this.enviDocumentData.gdDocumentId = document.documentId;
        return document;
    }

    /** aktualizuje treść NemedRanges */
    async updateTextRunsInNamedRanges(auth: OAuth2Client) {
        const documentId = this.enviDocumentData.gdDocumentId;
        if (!documentId)
            throw new Error('Letter file not set!' + this.enviDocumentData.id);
        const newData: { rangeName: string; newText: string }[] =
            this.makeDataforNamedRanges();
        await ToolsDocs.updateTextRunsInNamedRanges(auth, documentId, newData);
    }

    /** 1. odświeża namedRanges
     *  2. auktualizuje treść w namedRanges
     */
    async edit(auth: OAuth2Client) {
        const documentId = this.enviDocumentData.gdDocumentId;
        if (!documentId)
            throw new Error('Letter file not set!' + this.enviDocumentData.id);
        await ToolsDocs.refreshNamedRangesFromTags(auth, documentId);
        let document = (await ToolsDocs.getDocument(auth, documentId)).data;
        const namedRangesNames = Object.getOwnPropertyNames(
            document.namedRanges || {}
        );
        if (namedRangesNames.length)
            console.log('NamedRangesNamesFound %o', namedRangesNames);
        else throw new Error('No namedRanges found');

        document = (await ToolsDocs.getDocument(auth, documentId)).data;
        await this.updateTextRunsInNamedRanges(auth);
        return document;
    }

    protected makeDataforNamedRanges(): {
        rangeName: string;
        newText: string;
    }[] {
        if (!this.enviDocumentData._entitiesMain?.length)
            throw new Error('enviDocumentData._entitiesMain is empty');
        if (!this.enviDocumentData._cases.length)
            throw new Error('enviDocumentData._cases is empty');
        if (
            !(
                this.enviDocumentData.creationDate &&
                this.enviDocumentData.number &&
                this.enviDocumentData.description
            )
        )
            throw new Error(
                'enviDocumentData creationDate or number or description not found'
            );
        const number =
            typeof this.enviDocumentData.number === 'number'
                ? this.enviDocumentData.number.toString()
                : this.enviDocumentData.number;
        return [
            {
                rangeName: 'creationDate',
                newText: this.enviDocumentData.creationDate,
            },
            { rangeName: 'number', newText: number },
            {
                rangeName: 'address',
                newText: this.entitiesDataLabel(
                    this.enviDocumentData._entitiesMain
                ),
            },
            {
                rangeName: 'description',
                newText: this.enviDocumentData.description,
            },
            {
                rangeName: 'projectContext',
                newText: this.letterContextLabel(),
            },
            { rangeName: 'addressCc', newText: this.addressCcLabel() },
        ];
    }

    protected addressCcLabel() {
        if (
            !this.enviDocumentData._entitiesCc ||
            this.enviDocumentData._entitiesCc?.length === 0
        )
            return '-----';
        return this.entitiesDataLabel(this.enviDocumentData._entitiesCc);
    }

    /** tworzy etykietę z danymi address */
    protected entitiesDataLabel(entities: EntityData[]) {
        let label = '';
        for (let i = 0; i < entities.length; i++) {
            label += entities[i].name;
            if (entities[i].address) label += '\n' + entities[i].address;
            if (i < entities.length - 1) label += '\n';
        }
        return label;
    }

    makeFileName() {
        if (!this.enviDocumentData.creationDate)
            throw new Error('Document must have creationDate');
        return `${this.enviDocumentData.number} ${this.enviDocumentData.creationDate}`;
    }

    protected abstract makeCasesList(): string;

    /**Zwraca listę spraw, kamieni itd */
    protected abstract letterContextLabel(): string;
}
