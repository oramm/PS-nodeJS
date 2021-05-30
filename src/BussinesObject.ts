import Person from "./persons/Person";
import ToolsDb from "./tools/ToolsDb";

export default class BusinessObject {
    _dbTableName: string;
    _editor?: any;
    editorId?: number;
    constructor(initParamObject: { _dbTableName: string }) {
        this._dbTableName = initParamObject._dbTableName;
    }

    async setEditorId() {
        if (!this._editor) return;// throw new Error('Brakuje obiektu _editor!');
        let editor = new Person(this._editor);
        this.editorId = (await editor.getSystemRole()).personId;
        this._editor.id = this.editorId;
    }

    async addInDb(externalConn?: any, isPartOfTransaction?: boolean) {
        return await ToolsDb.addInDb(this._dbTableName, this, externalConn, isPartOfTransaction);
    }

    async editInDb(externalConn?: any, isPartOfTransaction?: boolean) {
        return await ToolsDb.editInDb(this._dbTableName, this, externalConn);
    }

    async deleteFromDb() {
        return await ToolsDb.deleteFromDb(this._dbTableName, this);
    }
}