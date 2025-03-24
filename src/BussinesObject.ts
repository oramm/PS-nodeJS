import Person from './persons/Person';
import ToolsDb from './tools/ToolsDb';
import mysql from 'mysql2/promise';
import { PersonData } from './types/types';

export default class BusinessObject {
    id?: number | string;
    _dbTableName: string;
    _editor?: PersonData;
    editorId?: number;
    constructor(initParamObject: {
        _dbTableName: string;
        id?: number;
        _editor?: PersonData;
    }) {
        this.id = initParamObject.id;
        this._dbTableName = initParamObject._dbTableName;
        this._editor = initParamObject._editor;
        this.editorId = this._editor?.id;
    }

    /** Zamiast tego używać metody PersonsController.getPersonFromSessionUserData()
     * @deprecated */
    async setEditorId() {
        if (!this._editor) return; // throw new Error('Brakuje obiektu _editor!');
        const editor = new Person(this._editor);
        const editorRole = await editor.getSystemRole();
        if (!editorRole)
            throw new Error(`W systemie nie ma użytkownika ${editor}`);
        this.editorId = editorRole.personId;
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
        _fieldsToUpdate?: string[]
    ) {
        return await ToolsDb.editInDb(
            this._dbTableName,
            this,
            externalConn,
            isPartOfTransaction,
            _fieldsToUpdate
        );
    }

    async deleteFromDb(
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        return await ToolsDb.deleteFromDb(
            this._dbTableName,
            this,
            externalConn,
            isPartOfTransaction
        );
    }
}
