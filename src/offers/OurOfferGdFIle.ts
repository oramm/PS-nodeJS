import DocumentTemplate from '../documentTemplates/DocumentTemplate';
import { OAuth2Client } from 'google-auth-library';
import DocumentGdFile from '../documentTemplates/DocumentGdFile';
import ToolsDocs from '../tools/ToolsDocs';
import { OurOfferData } from '../types/types';
import Setup from '../setup/Setup';
import EnviErrors from '../tools/Errors';
import CasesController from '../contracts/milestones/cases/CasesController';
import ToolsGd from '../tools/ToolsGd';

export default class OurOfferGdFile extends DocumentGdFile {
    protected enviDocumentData: OurOfferData;
    constructor(initObjectParameter: { enviDocumentData: OurOfferData }) {
        super(initObjectParameter);
        this._template = {
            gdId: Setup.Gd.ourOfferTemplateGdId,
            name: 'ourOfferTemplate',
        };
        this.enviDocumentData = initObjectParameter.enviDocumentData;
    }

    /** 1. Tworzy plik z szablonu w folderze pisma na GD
     *  2. Tworzy namedRanges z tagów w szablonie
     *   - osobną funkcją w pliku trzeba ustawić namedRages
     */
    async create(auth: OAuth2Client) {
        try {
            const document = await super.create(auth);
            if (!document.documentId)
                throw new Error(
                    'Offer file not created!' + this.enviDocumentData.id
                );
            const documentId = document.documentId;
            await ToolsDocs.initNamedRangesFromTags(auth, documentId);
            this.enviDocumentData.gdDocumentId = document.documentId;
            return document;
        } catch (error) {
            throw error;
        }
    }

    /** aktualizuje treść NemedRanges */
    async updateTextRunsInNamedRanges(auth: OAuth2Client) {
        const documentId = this.enviDocumentData.gdDocumentId;
        if (!documentId)
            throw new Error('Offer file not set!' + this.enviDocumentData.id);
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
            throw new Error('Offer file not set!' + this.enviDocumentData.id);
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
        if (!this.enviDocumentData.creationDate)
            throw new Error('Offer must have creationDate');
        if (!this.enviDocumentData.description)
            throw new Error('Offer must have description');
        if (
            !this.enviDocumentData.employerName &&
            !this.enviDocumentData._employer
        )
            throw new Error('Offer must have employerName or _employer data');

        return [
            {
                rangeName: 'creationDate',
                newText: this.enviDocumentData.creationDate,
            },
            {
                rangeName: 'description',
                newText: this.enviDocumentData.description,
            },
            {
                rangeName: 'employerName',
                newText: (this.enviDocumentData.employerName ||
                    this.enviDocumentData._employer?.name) as string,
            },
        ];
    }

    makeFileName() {
        if (!this.enviDocumentData.alias)
            throw new Error('Document must have alias');
        if (!this.enviDocumentData.creationDate)
            throw new Error('Document must have creationDate');
        return `Oferta ${this.enviDocumentData._type?.name} ${this.enviDocumentData.alias} ${this.enviDocumentData.creationDate}`;
    }

    async editFileName(auth: OAuth2Client) {
        if (!this.enviDocumentData.gdDocumentId)
            throw new EnviErrors.NoGdIdError();

        await ToolsGd.updateFile(auth, {
            id: this.enviDocumentData.gdDocumentId,
            name: this.makeFileName(),
        });
    }

    async moveToMakeOfferFolder(auth: OAuth2Client) {
        if (!this.enviDocumentData.gdDocumentId)
            throw new EnviErrors.NoGdIdError();

        const makeOfferCases = await CasesController.getCasesList(
            [{ offerId: this.enviDocumentData.id, typeId: 100 }] // 100 - CaseTypes.id dla typu sprawy "Przygotowanie oferty"
        );

        if (makeOfferCases.length !== 1)
            throw new Error('Wrong number of cases');
        const makeOferCase = makeOfferCases[0];

        const gDocument = await ToolsGd.getFileOrFolderById(
            auth,
            this.enviDocumentData.gdDocumentId
        );
        ToolsGd.moveFileOrFolder(
            auth,
            gDocument,
            makeOferCase.gdFolderId as string
        );
    }
}
