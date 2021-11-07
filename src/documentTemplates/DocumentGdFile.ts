import { Envi } from "../tools/EnviTypes";
import ToolsDocs from "../tools/ToolsDocs";
import DocumentTemplate from "./DocumentTemplate";

export default class DocumentGdFile {
    public _template: DocumentTemplate;
    public gdFile?: GoogleAppsScript.Drive.File;
    protected document: Envi.Document;
    description?: string;


    constructor(initObjectParamenter: { _template: DocumentTemplate; document: Envi.Document }) {
        this._template = initObjectParamenter._template;
        this.document = initObjectParamenter.document;
    }


}
