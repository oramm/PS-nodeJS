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


export default abstract class Letter extends BusinessObject implements Envi.Document {
    public id?: number;
    public number?: string | number;
    public description?: string;
    public creationDate?: string;
    public registrationDate?: string;
    public _documentOpenUrl?: string;
    public documentGdId?: string;
    _gdFolderUrl?: string;
    folderGdId?: string;
    _lastUpdated?: string;
    _contract: Contract;
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
            await association.addInDb(externalConn, isPartOfTransaction);
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
            await association.addInDb(externalConn, isPartOfTransaction);
        }
    }

    async edit(auth: OAuth2Client, files: Express.Multer.File[]) {
        console.group('Letter edit');
        await this.editLetterGdElements(auth, files);
        console.log('Letter folder and file in GD edited');
        await this.editInDb();
        console.log('Letter edited in DB');
        console.groupEnd();
    }

    async editInDb() {
        console.log('Letter edit in Db Start');
        await ToolsDb.transaction(async conn => {
            await Promise.all([
                this.deleteCasesAssociationsFromDb(),
                this.deleteEntitiesAssociationsFromDb()
            ]);
            console.log('associacions deleted');

            await Promise.all([
                super.editInDb(conn, true).then(() => { console.log('letterData edited') }),
                this.addCaseAssociationsInDb(conn, true),
                this.addEntitiesAssociationsInDb(conn, true)
            ]);
            console.log('associaciont renewed');
        })
    }

    /** jest wywoływana w editLetter()
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
    async appendAttachmentsHandler(auth: OAuth2Client, files: Express.Multer.File[]): Promise<void> {
        this.letterFilesCount += files.length;
    }

    abstract initialise(auth: OAuth2Client, files: Express.Multer.File[]): Promise<void>;
    abstract editLetterGdElements(auth: OAuth2Client, files: Express.Multer.File[]): Promise<void>
}