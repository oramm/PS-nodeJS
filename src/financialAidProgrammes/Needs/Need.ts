import BusinessObject from '../../BussinesObject';
import ToolsDb from '../../tools/ToolsDb';
import {
    ApplicationCallData,
    EntityData,
    FocusAreaData,
    NeedData,
    NeedsFocusAreasData,
} from '../../types/types';
import mysql from 'mysql2/promise';
import NeedsFocusArea from '../NeedsFocusAreas/NeedFocusArea';

export default class Need extends BusinessObject implements NeedData {
    id?: number;
    clientId: number;
    _client: EntityData;
    name: string;
    description: string;
    status: string;
    _applicationCall?: ApplicationCallData | null;
    applicationCallId?: number | null;
    _focusAreas?: FocusAreaData[] = [];

    constructor(initParamObject: NeedData) {
        super({ ...initParamObject, _dbTableName: 'Needs' });
        if (!initParamObject.clientId && !initParamObject._client.id)
            throw new Error('clientId is required');
        this.clientId = (initParamObject.clientId ||
            initParamObject._client.id) as number;
        this._client = initParamObject._client;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.status = initParamObject.status;
        this._applicationCall = initParamObject._applicationCall;
        if (initParamObject._applicationCall === null)
            this.applicationCallId = null;
        else
            this.applicationCallId =
                initParamObject.applicationCallId ??
                initParamObject._applicationCall?.id;
        this._focusAreas = initParamObject._focusAreas;
    }

    async addNewController() {
        try {
            console.group('Creating new Need');
            await this.addInDb();
            console.log('Need added to db');
            console.groupEnd();
        } catch (err) {
            throw err;
        }
    }

    async editController() {
        try {
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                console.group('Editing Need');
                await this.editInDb(conn, true);
                console.log('Need edited in db');
                await this.editNeedsFocusAreasInDb(conn);
                console.groupEnd();
            });
        } catch (err) {
            console.log('Need edit error');
            throw err;
        }
    }

    async deleteController() {
        if (this.id) await this.deleteFromDb();
    }

    private async editNeedsFocusAreasInDb(externalConn: mysql.PoolConnection) {
        await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await this.deleteNeedsFocusAreasFromDb(conn, true);
            await this.addNeedsFocusAreasInDb(conn, true);
        }, externalConn);
    }

    async addInDb() {
        await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await super.addInDb(conn, true);
            await this.addNeedsFocusAreasInDb(conn, true);
        });
    }

    private async addNeedsFocusAreasInDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        for (const focusArea of this._focusAreas ?? []) {
            const associationData: NeedsFocusAreasData = {
                _need: this,
                _focusArea: focusArea,
                comment: undefined,
            };
            const associationObject = new NeedsFocusArea(associationData);
            await associationObject.addInDb(externalConn, isPartOfTransaction);
        }
    }

    private async deleteNeedsFocusAreasFromDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        console.log('Deleting Needs-FocusAreas associations from db');
        const sql = `DELETE FROM Needs_FocusAreas WHERE NeedId = ?`;
        return await ToolsDb.executePreparedStmt(
            sql,
            [this.id],
            this,
            externalConn,
            isPartOfTransaction
        );
    }
}
