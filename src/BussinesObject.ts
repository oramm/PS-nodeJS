import Person from './persons/Person';
import ToolsDb from './tools/ToolsDb';
import mysql from 'mysql2/promise';

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
    }

    async setEditorId() {
        if (!this._editor) return; // throw new Error('Brakuje obiektu _editor!');
        const editor = new Person(this._editor);
        this.editorId = (await editor.getSystemRole()).personId;
        this._editor.id = this.editorId;
    }

    async addInDb(
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        return await ToolsDb.addInDb(
            this._dbTableName,
            this,
            externalConn,
            isPartOfTransaction
        );
    }

    async editInDb(
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction: boolean = false,
        fieldsToUpdate?: string[]
    ) {
        return await ToolsDb.editInDb(
            this._dbTableName,
            this,
            externalConn,
            isPartOfTransaction,
            fieldsToUpdate
        );
    }

    async deleteFromDb() {
        return await ToolsDb.deleteFromDb(this._dbTableName, this);
    }
}
