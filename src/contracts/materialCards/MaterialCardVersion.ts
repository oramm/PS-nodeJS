import ToolsDate from "../../tools/ToolsDate";
import ToolsGd from "../../tools/ToolsGd";

export default class MaterialCardVersion {
    id?: number;
    _lastUpdated?: any;
    _editor: any;
    editorId: number;
    status: string;
    parentId: number;

    constructor(initParamObject: any) {
        this.id = initParamObject.id;
        this.editorId = initParamObject._editor.id;
        this.status = initParamObject.status;
        this.parentId = initParamObject.parentId;
        this._lastUpdated = initParamObject._lastUpdated;
        this._editor = initParamObject._editor;
    }
}

