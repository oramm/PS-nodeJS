import BusinessObject from '../BussinesObject';
import DocumentTemplate from '../documentTemplates/DocumentTemplate';
import ToolsGd from '../tools/ToolsGd';

export default class ProcessStep extends BusinessObject {
    id?: number;
    name?: string;
    description?: string;
    _parent?: any;
    processId?: number;
    status?: string;
    _lastUpdated?: string;
    _documentOpenUrl?: string;
    _documentTemplate?: any
    documentTemplateContentsId?: number | null;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'ProcessesSteps' });
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
        this._documentTemplate = new DocumentTemplate(initParamObject._documentTemplate);
        if (this.hasTemplate(initParamObject))
            this.setDocumentTemplateContentsIdandUrl(initParamObject._documentTemplate._contents.id);
    }

    setDocumentTemplateContentsIdandUrl(id: number) {
        if (id) {
            this.documentTemplateContentsId = this._documentTemplate._contents.id;
            this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(this._documentTemplate.gdId);
        } else {
            this.documentTemplateContentsId = null;
            this._documentOpenUrl = undefined;
        }
    }

    private hasTemplate(initParamObject: any) {
        return initParamObject._documentTemplate && initParamObject._documentTemplate._contents;
    }

}

