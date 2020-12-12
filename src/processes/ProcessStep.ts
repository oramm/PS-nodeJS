import DocumentTemplate from '../documentTemplates/DocumentTemplate';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';

export default class ProcessStep {
    id?: number;
    name?: string;
    description?: string;
    _parent?: any;
    processId?: number;
    status?: string;
    _lastUpdated?: string;
    _documentOpenUrl?: string;
    _documentTemplate?: any
    documentTemplateId?: number;

    constructor(initParamObject: any) {

        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        if (initParamObject._parent) {
            this._parent = initParamObject._parent;
            this.processId = initParamObject._parent.id;
        }
        if (initParamObject.status)
            this.status = initParamObject.status;

        this._lastUpdated = initParamObject._lastUpdated;
        if (initParamObject._documentTemplate && initParamObject._documentTemplate.id) {
            this._documentTemplate = new DocumentTemplate(initParamObject._documentTemplate)
            this.documentTemplateId = this._documentTemplate.id;
            this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(initParamObject._documentTemplate.gdId);
        }
    }

}

