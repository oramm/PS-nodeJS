// Manual mock for BusinessObject to avoid circular dependencies in tests

export default class BusinessObject {
    id?: number | string;
    _dbTableName: string;
    _editor?: any;
    editorId?: number;

    constructor(initParamObject: {
        _dbTableName: string;
        id?: number;
        _editor?: any;
    }) {
        this.id = initParamObject.id;
        this._dbTableName = initParamObject._dbTableName;
        this._editor = initParamObject._editor;
        this.editorId = this._editor?.id;
    }
}
