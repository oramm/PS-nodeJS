import ToolsDocs from '../tools/ToolsDocs';
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

    /** Tworzy plik z szablonu w folderze docelowym na GD */
    async create(auth: OAuth2Client) {
        if (!this.enviDocumentData.gdFolderId)
            throw new EnviErrors.NoGdIdError('Document must have folderFdId');
        if (!this._template) throw new Error('OurLetter must have Template');
        const gdFile = await ToolsGd.copyFile(
            auth,
            this._template.gdId,
            this.enviDocumentData.gdFolderId,
            this.makeFileName()
        );
        await ToolsGd.createPermissions(auth, {
            fileId: <string>gdFile.data.id,
        });
        this.enviDocumentData.gdDocumentId = <string>gdFile.data.id;
        this.enviDocumentData._documentEditUrl = ToolsGd.createDocumentEditUrl(
            <string>gdFile.data.id
        );
        const document = (
            await ToolsDocs.getDocument(auth, <string>gdFile.data.id)
        ).data;

        return document;
    }

    abstract makeFileName(): string;
}
