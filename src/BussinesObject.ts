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
        id?: number | string;
        _editor?: PersonData;
    }) {
        this.id = initParamObject.id;
        this._dbTableName = initParamObject._dbTableName;
        this._editor = initParamObject._editor;
        this.editorId = this._editor?.id;
    }
}
