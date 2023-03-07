import { docs_v1 } from "googleapis";
import { Envi } from "../tools/EnviTypes";
import ToolsDocs from "../tools/ToolsDocs";
import DocumentTemplate from "./DocumentTemplate";
import { OAuth2Client } from 'google-auth-library';
import ToolsGd from "../tools/ToolsGd";
import EnviErrors from "../tools/Errors";

export default class DocumentGdFile {
    public _template?: DocumentTemplate;
    protected enviDocumentData: Envi.Document;
    description?: string;


    constructor(initObjectParamenter: { _template?: DocumentTemplate; enviDocumentData: Envi.Document }) {
        this._template = initObjectParamenter._template;
        this.enviDocumentData = initObjectParamenter.enviDocumentData;
    }

    /** Tworzy plik z szablonu w folderze docelowym na GD
     */
    async create(auth: OAuth2Client) {
        if (!this.enviDocumentData.folderGdId) throw new EnviErrors.NoGdIdError('Document must have folderFdId');
        if (!this._template) throw new Error('OurLetter must have Template');
        const gdFile = await ToolsGd.copyFile(
            auth,
            this._template.gdId,
            this.enviDocumentData.folderGdId,
            `${this.enviDocumentData.number} ${this.enviDocumentData.creationDate}`
        );
        await ToolsGd.createPermissions(auth, { fileId: <string>gdFile.data.id });
        this.enviDocumentData.documentGdId = <string>gdFile.data.id;
        this.enviDocumentData._documentEditUrl = ToolsGd.createDocumentEditUrl(<string>gdFile.data.id);
        let document = await (await ToolsDocs.getDocument(auth, <string>gdFile.data.id)).data;

        return document;
    }
}