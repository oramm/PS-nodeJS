import DocumentTemplate from '../documentTemplates/DocumentTemplate';
import { OAuth2Client } from 'google-auth-library';
import DocumentGdFile from '../documentTemplates/DocumentGdFile';
import { Envi } from '../tools/Tools';
import ToolsDocs from '../tools/ToolsDocs';
import OurOffer from './OurOffer';

export default class OurOfferGdFile extends DocumentGdFile {
    constructor(initObjectParameter: {
        _template?: DocumentTemplate;
        enviDocumentData: OurOffer;
    }) {
        super(initObjectParameter);
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

    private makeDataforNamedRanges(): { rangeName: string; newText: string }[] {
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
        ];
    }
}
