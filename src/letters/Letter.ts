import BusinessObject from '../BussinesObject';
import Contract from '../contracts/Contract';
import Entity from '../entities/Entity';
import Person from '../persons/Person';
import Project from '../projects/Project';
import { Envi } from '../tools/EnviTypes';
import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';
import mysql from 'mysql2/promise';
import LetterEntity from './associations/LetterEntity';
import LetterCase from './associations/LetterCase';
import Case from '../contracts/milestones/cases/Case';
import { OAuth2Client } from 'google-auth-library';
import Tools from '../tools/Tools';
import { drive_v3 } from 'googleapis';

export default abstract class Letter extends BusinessObject implements Envi.Document {
    public id?: number;
    public number?: string | number;
    public description?: string;
    public creationDate?: string;
    public registrationDate?: string;
    public _documentOpenUrl?: string;
    public documentGdId: string;
    _gdFolderUrl?: string;
    folderGdId?: string;
    _lastUpdated?: string;
    _contract?: Contract;
    _project: Project;
    projectId?: any;
    _cases: Case[];
    _entitiesMain: Entity[];
    _entitiesCc: Entity[];
    letterFilesCount: number = 0;
    _editor?: any;
    _fileOrFolderChanged?: boolean;

    editorId?: number;
    _canUserChangeFileOrFolder?: boolean;
    _folderName?: string;
    _documentEditUrl?: string;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'Letters' });
        this.id = initParamObject.id;
        this.description = initParamObject.description;
        this.number = initParamObject.number;
        this.creationDate = ToolsDate.dateJsToSql(initParamObject.creationDate);

        this.registrationDate = ToolsDate.dateJsToSql(initParamObject.registrationDate);
        this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(initParamObject.documentGdId);
        this.documentGdId = initParamObject.documentGdId;
        if (initParamObject.folderGdId) {
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(initParamObject.folderGdId);
            this.folderGdId = initParamObject.folderGdId;
        }
        this._lastUpdated = initParamObject._lastUpdated;
        this._contract = initParamObject._contract;
        this._project = initParamObject._project;
        this.projectId = initParamObject._project.id;
        this._cases = initParamObject._cases;
        this._entitiesMain = (initParamObject._entitiesMain) ? initParamObject._entitiesMain : [];
        this._entitiesCc = (initParamObject._entitiesCc) ? initParamObject._entitiesCc : [];
        this.letterFilesCount = initParamObject.letterFilesCount;

        this._editor = initParamObject._editor;
        this._canUserChangeFileOrFolder// = this.canUserChangeFileOrFolder();
        this._fileOrFolderChanged;
    }

    /*
     * Używać tylko gdy mamy wiele blobów
     */
    makeFolderName(): string {
        return this.number + ' ' + this.creationDate;
    }


    async addInDb() {
        return await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await super.addInDb(conn, true);
            await this.addEntitiesAssociationsInDb(conn, true);
            await this.addCaseAssociationsInDb(conn, true);
        });
    }

    async addEntitiesAssociationsInDb(externalConn: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const entityAssociations: LetterEntity[] = [];
        this._entitiesMain.map((item) => {
            entityAssociations.push(new LetterEntity({
                letterRole: 'MAIN',
                _letter: this,
                _entity: item
            }));
        });
        this._entitiesCc.map((item) => {
            entityAssociations.push(new LetterEntity({
                letterRole: 'CC',
                _letter: this,
                _entity: item
            }));
        });
        for (const association of entityAssociations) {
            association.addInDb(externalConn, isPartOfTransaction);
        }
    }

    async addCaseAssociationsInDb(externalConn: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const associations: LetterCase[] = [];
        this._cases.map((item) => {
            associations.push(new LetterCase({
                _letter: this,
                _case: item
            }));
        });
        for (const association of associations) {
            association.addInDb(externalConn, isPartOfTransaction);
        }
    }
    /** Tworzy folder i wrzuca pliki z blob */
    protected async createLetterFolder(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        const letterFolder = <drive_v3.Schema$File>await ToolsGd.createFolder(auth,
            { name: this._folderName || 'tmpName', parents: [this._project.lettersGdFolderId] });

        ToolsGd.createPermissions(auth, { fileId: <string>letterFolder.id });
        this.folderGdId = <string>letterFolder.id;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(this.folderGdId);

        const promises = [];
        for (const blobEnvi of blobEnviObjects) {
            blobEnvi.parent = this.folderGdId;
            promises.push(ToolsGd.uploadFile(auth, blobEnvi));
        }

        await Promise.all(promises);
        this._documentOpenUrl = undefined;
        this.documentGdId = '';
        return letterFolder;
    }
    async edit(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]) {
        await this.editInDb();
        await this.editLetterGdElements(auth, blobEnviObjects);
    }

    async editInDb() {
        await Promise.all([
            this.deleteCasesAssociationsFromDb(),
            this.deleteEntitiesAssociationsFromDb()
        ]);

        await ToolsDb.transaction(async conn => {
            await super.editInDb(conn, true);
            await Promise.all([
                this.addCaseAssociationsInDb(conn, true),
                this.addEntitiesAssociationsInDb(conn, true)
            ]);
        })
    }

    /*
     * jest wywoływana w editLetter()
     * kasuje Instancje procesu i zadanie ramowe, potem tworzy je nanowo dla nowego typu sprawy
     */
    async editEntitiesAssociationsInDb(externalConn: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        await this.deleteEntitiesAssociationsFromDb();
        await this.addEntitiesAssociationsInDb(externalConn, isPartOfTransaction);
    }

    async editCasesAssociationsInDb(externalConn: mysql.PoolConnection, isPartOfTransaction?: boolean) {
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

    deleteFromGd(auth: OAuth2Client) {
        ToolsGd.deleteFileOrFolder(auth, this.folderGdId || this.documentGdId)
    }

    abstract initialise(auth: OAuth2Client, blobEnviObjects: any[]): Promise<void>;
    abstract appendAttachments(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]): Promise<void>;
    abstract editLetterGdElements(auth: OAuth2Client, blobEnviObjects: Envi._blobEnviObject[]): Promise<void>
}