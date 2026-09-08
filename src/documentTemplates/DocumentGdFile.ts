import { OAuth2Client } from 'google-auth-library';
import ToolsGd from '../tools/ToolsGd';
import EnviErrors from '../tools/Errors';
import { DocumentTemplateData, GenericDocumentData } from '../types/types';

export default abstract class DocumentGdFile {
    public _template?: DocumentTemplateData;
    protected enviDocumentData: GenericDocumentData;
    description?: string;

    constructor(initObjectParamenter: {
        _template?: DocumentTemplateData;
        enviDocumentData: GenericDocumentData;
    }) {
        this._template = initObjectParamenter._template;
        this.enviDocumentData = initObjectParamenter.enviDocumentData;
    }

    /** Tworzy plik z szablonu w folderze docelowym na GD.
     *
     *  Zwraca sam identyfikator dokumentu, a nie jego treść. Wcześniej na końcu
     *  szedł jeszcze `ToolsDocs.getDocument`, choć z całej odpowiedzi używane było
     *  wyłącznie `documentId` — czyli ten sam identyfikator, który zwróciło już
     *  kopiowanie. Odczyt świeżej kopii szablonu kosztuje ~1 s (~90 kB odpowiedzi)
     *  i nie wnosił nic: kto potrzebuje treści, czyta ją i tak sam kawałek dalej
     *  (`initNamedRangesFromTags`).
     *
     *  `fileName` pozwala nadać nazwę docelową od razu przy tworzeniu. Bez niego
     *  nazwa powstaje z `makeFileName()`, czyli z danych, których w chwili
     *  tworzenia może jeszcze nie być (numer pisma nadaje baza) — i trzeba ją
     *  potem poprawiać osobnym zapytaniem do Google.
     */
    async create(
        auth: OAuth2Client,
        fileName?: string
    ): Promise<{ documentId: string }> {
        if (!this.enviDocumentData.gdFolderId)
            throw new EnviErrors.NoGdIdError('Document must have folderFdId');
        if (!this._template) throw new Error('OurLetter must have Template');
        const gdFile = await ToolsGd.copyFile(
            auth,
            this._template.gdId,
            this.enviDocumentData.gdFolderId,
            fileName ?? this.makeFileName()
        );
        const documentId = <string>gdFile.data.id;
        await ToolsGd.createPermissions(auth, {
            fileId: documentId,
            // kopiowanie zwróciło już `driveId` — nie pytamy o to drugi raz
            driveId: gdFile.data.driveId ?? null,
        });
        this.enviDocumentData.gdDocumentId = documentId;
        this.enviDocumentData._documentEditUrl =
            ToolsGd.createDocumentEditUrl(documentId);

        return { documentId };
    }

    abstract makeFileName(): string;
}
