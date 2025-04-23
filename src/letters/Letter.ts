import BusinessObject from '../BussinesObject';
import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';
import mysql from 'mysql2/promise';
import LetterEntity from './associations/LetterEntity';
import LetterCase from './associations/LetterCase';
import { OAuth2Client } from 'google-auth-library';
import {
    CaseData,
    ContractData,
    EntityData,
    LetterData,
    LetterEventData,
    PersonData,
} from '../types/types';
import { UserData } from '../types/sessionTypes';
import LetterEvent from './letterEvent/LetterEvent';
import PersonsController from '../persons/PersonsController';
import Setup from '../setup/Setup';

export default abstract class Letter
    extends BusinessObject
    implements LetterData
{
    id?: number;
    number?: string | number;
    description?: string;
    creationDate?: string;
    registrationDate?: string;
    _documentOpenUrl?: string;
    gdDocumentId?: string | null;
    _gdFolderUrl?: string;
    gdFolderId?: string | null;
    _lastUpdated?: string;
    _cases: CaseData[];
    _entitiesMain: EntityData[];
    _entitiesCc: EntityData[];
    letterFilesCount: number = 0;
    _editor: PersonData;
    _fileOrFolderChanged?: boolean;
    status: string;
    editorId?: number;
    _canUserChangeFileOrFolder?: boolean;
    _documentEditUrl?: string;
    _lastEvent?: LetterEvent | null;

    constructor(initParamObject: LetterData) {
        super({ ...initParamObject, _dbTableName: 'Letters' });
        if (!initParamObject.creationDate) {
            throw new Error('creationDate is required');
        }
        if (!initParamObject.registrationDate) {
            throw new Error('registrationDate is required');
        }
        if (!initParamObject._cases) {
            throw new Error('_cases is required');
        }

        this.id = initParamObject.id;
        this.description = initParamObject.description;
        this.number = initParamObject.number;
        this.creationDate = ToolsDate.dateJsToSql(initParamObject.creationDate);
        this.registrationDate = ToolsDate.dateJsToSql(
            initParamObject.registrationDate
        );
        if (initParamObject.gdDocumentId) {
            this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(
                initParamObject.gdDocumentId
            );
            this.gdDocumentId = initParamObject.gdDocumentId;
        }
        if (initParamObject.gdFolderId) {
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(
                initParamObject.gdFolderId
            );
            this.gdFolderId = initParamObject.gdFolderId;
        }
        this._lastUpdated = initParamObject._lastUpdated;
        this._cases = initParamObject._cases;
        this._entitiesMain = initParamObject._entitiesMain
            ? initParamObject._entitiesMain
            : [];
        this._entitiesCc = initParamObject._entitiesCc
            ? initParamObject._entitiesCc
            : [];
        if (initParamObject.letterFilesCount)
            this.letterFilesCount = initParamObject.letterFilesCount;

        this._editor = initParamObject._editor;
        this._canUserChangeFileOrFolder;
        this._fileOrFolderChanged;
        this.status = initParamObject.status;
        this.initLastEvent(initParamObject._lastEvent); //przy nowej ofercie lastEvent jeszcze nie istnieje
    }

    private initLastEvent(lastEventData: LetterEventData | undefined | null) {
        if (!lastEventData?.letterId) return;
        if (lastEventData) {
            lastEventData.letterId = this.id;
            this._lastEvent = new LetterEvent(lastEventData);
        } else this._lastEvent = null;
    }

    protected async createNewLetterEvent(userData: UserData) {
        const _editor = await PersonsController.getPersonFromSessionUserData(
            userData
        );

        this._lastEvent = new LetterEvent({
            letterId: this.id as number,
            eventType: Setup.LetterEventType.CREATED,

            _editor,
        });
        await this._lastEvent.addNewController();
    }

    async addInDb() {
        return await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await super.addInDb(conn, true);
            await this.addEntitiesAssociationsInDb(conn, true);
            await this.addCaseAssociationsInDb(conn, true);
        });
    }

    async addEntitiesAssociationsInDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        const entityAssociations: LetterEntity[] = [];
        this._entitiesMain.map((item) => {
            entityAssociations.push(
                new LetterEntity({
                    letterRole: 'MAIN',
                    _letter: this,
                    _entity: item,
                })
            );
        });
        this._entitiesCc.map((item) => {
            entityAssociations.push(
                new LetterEntity({
                    letterRole: 'CC',
                    _letter: this,
                    _entity: item,
                })
            );
        });
        for (const association of entityAssociations) {
            await association.addInDb(externalConn, isPartOfTransaction);
        }
    }

    async addCaseAssociationsInDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        const associations: LetterCase[] = [];
        this._cases.map((item) => {
            associations.push(
                new LetterCase({
                    _letter: this,
                    _case: item,
                })
            );
        });
        for (const association of associations) {
            await association.addInDb(externalConn, isPartOfTransaction);
        }
    }

    async editController(
        auth: OAuth2Client,
        files: Express.Multer.File[],
        userData: UserData
    ) {
        console.group('Letter edit');
        await this.editLetterGdElements(auth, files);
        console.log('Letter folder and file in GD edited');
        await this.editInDb();
        console.log('Letter edited in DB');
        console.groupEnd();
    }

    async editInDb() {
        console.log('Letter edit in Db Start');
        await ToolsDb.transaction(async (conn) => {
            await Promise.all([
                this.deleteCasesAssociationsFromDb(),
                this.deleteEntitiesAssociationsFromDb(),
            ]);
            console.log('associacions deleted');

            await Promise.all([
                super.editInDb(conn, true).then(() => {
                    console.log('letterData edited');
                }),
                this.addCaseAssociationsInDb(conn, true),
                this.addEntitiesAssociationsInDb(conn, true),
            ]);
            console.log('associaciont renewed');
        });
    }

    /** jest wywoływana w editLetter()
     * kasuje Instancje procesu i zadanie ramowe, potem tworzy je nanowo dla nowego typu sprawy
     */
    async editEntitiesAssociationsInDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        await this.deleteEntitiesAssociationsFromDb();
        await this.addEntitiesAssociationsInDb(
            externalConn,
            isPartOfTransaction
        );
    }

    async editCasesAssociationsInDb(
        externalConn: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        await this.deleteCasesAssociationsFromDb();
        await this.addCaseAssociationsInDb(externalConn, isPartOfTransaction);
    }
    async deleteEntitiesAssociationsFromDb() {
        const sql = `DELETE FROM Letters_Entities WHERE LetterId =?`;
        return await ToolsDb.executePreparedStmt(sql, [this.id], this);
    }

    async deleteCasesAssociationsFromDb() {
        const sql = `DELETE FROM Letters_Cases WHERE LetterId =?`;
        return await ToolsDb.executePreparedStmt(sql, [this.id], this);
    }

    async appendAttachmentsHandler(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ): Promise<void> {
        this.letterFilesCount += files.length;
    }

    setContractFromClientData(contract: ContractData) {
        this._cases.map((item) => {
            if (!item._parent) throw new Error('Case must have _parent');
            if (!item._parent._contract)
                throw new Error('Case must have _parent._contract');
            item._parent._contract = contract;
        });
    }

    abstract addNewController(
        auth: OAuth2Client,
        files: Express.Multer.File[],
        userData: UserData
    ): Promise<void>;
    abstract editLetterGdElements(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ): Promise<void>;
}
