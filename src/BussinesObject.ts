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

    /** @deprecated */
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

    /** @deprecated */
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

    /** @deprecated */
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
