import { docs_v1 } from "googleapis";
import { Envi } from "../tools/EnviTypes";
import ToolsDocs from "../tools/ToolsDocs";
import DocumentTemplate from "./DocumentTemplate";
import { OAuth2Client } from 'google-auth-library';
import ToolsGd from "../tools/ToolsGd";

export default class DocumentGdFile {
    public _template: DocumentTemplate;
    public gdFile?: docs_v1.Schema$Document;
    protected document: Envi.Document;
    description?: string;


    constructor(initObjectParamenter: { _template: DocumentTemplate; document: Envi.Document }) {
        this._template = initObjectParamenter._template;
        this.document = initObjectParamenter.document;
    }

    /*
     * tworzy plik z szablonu w folderze docelowym na GD
     */
    async create(auth: OAuth2Client) {
        if (!this.document.folderGdId) throw new Error('Document must have folderFdId');
        const gdFile = await ToolsGd.copyFile(auth, this._template.gdId, this.document.folderGdId, this.document.number + ' ' + this.document.creationDate);
        await ToolsGd.createPermissions(auth, { fileId: <string>gdFile.data.id });
        this.document.documentGdId = <string>gdFile.data.id;
        this.document._documentEditUrl = ToolsGd.createDocumentEditUrl(<string>gdFile.data.id);
        this.gdFile = await ToolsDocs.getDocument(auth, <string>gdFile.data.id);
        await this.createNamedRanges(auth);
        //this.fillNamedRanges();
        //if (this._template._contents.gdId)
        //    this.fillContentsFromTemplate();
        return this.gdFile;
    }

    /*
 * Tworzy zakresy nazwane w szablonie - używać przy dodawaniu naszych pism
 */
    async createNamedRanges(auth: OAuth2Client) {
        if (!this.gdFile) throw new Error('brak gdFile');
        const templateGdFile = await ToolsDocs.getDocument(auth, this._template.gdId)
        ToolsDocs.createNamedRangesByTags(auth, this.gdFile, ToolsDocs.getNameRangesTagsFromTemplate(templateGdFile));
    }

}
