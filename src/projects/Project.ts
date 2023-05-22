import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import Entity from '../entities/Entity';
import ProjectEntity from './ProjectEntity';
import BusinessObject from '../BussinesObject';
import ToolsGd from '../tools/ToolsGd';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import Setup from '../setup/Setup';
import mysql from 'mysql2/promise';

export default class Project extends BusinessObject {
    id?: number;
    ourId: string;
    name: string;
    alias: string;
    startDate: string | undefined;
    endDate: string | undefined;
    status: string;
    comment: string;
    financialComment: any;
    investorId: any;
    totalValue: any;
    qualifiedValue: any;
    dotationValue: any;
    gdFolderId: string | undefined;
    _gdFolderUrl: string | undefined;
    lettersGdFolderId?: string;
    googleGroupId: any;
    _googleGroupUrl: string | undefined;
    googleCalendarId: any;
    _googleCalendarUrl: any;
    _ourId_Alias: string;
    _lastUpdated: any;
    _engineers: Entity[];
    _employers: Entity[];

    constructor(initParamObject: any) {
        super({ _dbTableName: 'Projects' });
        this.id = initParamObject.id;
        this.ourId = initParamObject.ourId;
        this.alias = initParamObject.alias;
        this.startDate = ToolsDate.dateJsToSql(initParamObject.startDate);
        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate);
        this.name = initParamObject.name;
        this.status = initParamObject.status;
        this.comment = initParamObject.comment;
        if (initParamObject.financialComment) this.financialComment = initParamObject.financialComment;
        if (initParamObject.investorId) this.investorId = initParamObject.investorId;
        if (initParamObject.totalValue) this.totalValue = initParamObject.totalValue;
        if (initParamObject.qualifiedValue) this.qualifiedValue = initParamObject.qualifiedValue;
        if (initParamObject.dotationValue) this.dotationValue = initParamObject.dotationValue;

        if (initParamObject.gdFolderId) {
            this.gdFolderId = initParamObject.gdFolderId;
            this._gdFolderUrl = 'https://drive.google.com/drive/folders/' + initParamObject.gdFolderId;
        }
        this.lettersGdFolderId = initParamObject.lettersGdFolderId;

        if (initParamObject.googleGroupId) {
            this.googleGroupId = initParamObject.googleGroupId;
            this._googleGroupUrl = 'https://groups.google.com/forum/?hl=pl#!forum/' + this.googleGroupId.replace(/\./gi, '');
        }
        if (initParamObject.googleCalendarId) {
            this.googleCalendarId = initParamObject.googleCalendarId;
            this._googleCalendarUrl = this.makeCalendarUrl();
        }
        this._ourId_Alias = this.ourId
        if (this.alias)
            this._ourId_Alias += ' ' + this.alias;
        this._lastUpdated = initParamObject._lastUpdated;
        this.gdFolderName();

        this._employers = (initParamObject._employers) ? initParamObject._employers : [];
        this._engineers = (initParamObject._engineers) ? initParamObject._engineers : [];
        this.setProjectEngineersAssociations(this._engineers);
    }

    gdFolderName() {
        return this._ourId_Alias;
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }

    async createProjectFolder(auth: OAuth2Client) {
        const caseFolder = await ToolsGd.setFolder(auth, { parentId: Setup.Gd.rootFolderId, name: this.gdFolderName() });
        this.setGdFolderIdAndUrl(caseFolder.id as string);
        return caseFolder;
    }

    async editProjectFolder(auth: OAuth2Client) {
        return await ToolsGd.updateFolder(auth, { name: this.gdFolderName(), id: this.gdFolderId });

    }

    async deleteProjectFolder(auth: OAuth2Client) {
        const drive = google.drive({ version: 'v3', auth });
        const filesSchema = await drive.files.get({ fileId: this.gdFolderId, fields: 'id, ownedByMe', });
        if (filesSchema.data.ownedByMe)
            await ToolsGd.trashFile(auth, filesSchema.data.id as string);
        else
            await ToolsGd.updateFolder(auth, { id: this.gdFolderId, name: `${this.gdFolderName()} - USUŃ` });
    }


    makeCalendarUrl(): string {
        return 'https://calendar.google.com/calendar/embed?src=' + this.googleCalendarId + '&ctz=Europe%2FWarsaw';
    }

    async setProjectEntityAssociationsFromDb() {
        let sql = 'SELECT  Projects_Entities.ProjectId, \n \t' +
            'Projects_Entities.EntityId, \n \t' +
            'Projects_Entities.ProjectRole, \n \t' +
            'Entities.Name, \n \t' +
            'Entities.Address, \n \t' +
            'Entities.TaxNumber, \n \t' +
            'Entities.Www, \n \t' +
            'Entities.Email, \n \t' +
            'Entities.Phone, \n \t' +
            'Entities.Fax \n' +
            'FROM Projects_Entities \n' +
            'JOIN Projects ON Projects_Entities.ProjectId = Projects.Id \n' +
            'JOIN Entities ON Projects_Entities.EntityId=Entities.Id \n' +
            'WHERE Projects.OurId="' + this.ourId + '" \n' +
            'ORDER BY Projects_Entities.ProjectRole, Entities.Name';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        const allEntitiesInProject = this.processProjectEntityAssociations(result);

        this.setProjectEntityAssociations(allEntitiesInProject);
    }

    private processProjectEntityAssociations(result: any[]) {
        let newResult: ProjectEntity[] = [];

        for (const row of result) {
            const item = new ProjectEntity({
                projectRole: row.ProjectRole,
                _project: {
                    id: row.ProjectId
                },
                _entity: new Entity({
                    id: row.EntityId,
                    name: row.Name,
                    address: row.Address,
                    taxNumber: row.TaxNumber,
                    www: row.Www,
                    email: row.Email,
                    phone: row.Phone,
                    fax: row.Fax
                })
            });
            newResult.push(item);
        }
        return newResult;
    }

    setProjectEngineersAssociations(engineers: Entity[]) {
        this._engineers = engineers;
        if (this._engineers.length === 0)
            this._engineers.push(new Entity({
                id: 1,
                name: 'ENVI',
                address: 'ul. Jana Brzechwy 3, 49-305 Brzeg',
                taxNumber: '747-191-75-75',
            }));
    }
    /**
     * używany do przetworzenia wyniku z Db 
     */
    setProjectEntityAssociations(allProjectEntityAssociations: ProjectEntity[]) {
        this._employers = allProjectEntityAssociations
            .filter((item: any) => item._project.id === this.id && item.projectRole == 'EMPLOYER')
            .map((item: any) => item._entity);

        const engineers = allProjectEntityAssociations
            .filter((item: any) => item._project.id === this.id && item.projectRole == 'ENGINEER')
            .map((item: any) => item._entity);

        this.setProjectEngineersAssociations(engineers);
    }

    /*
     * jest wywoływana w addNewProject()
     * tworzy instancję procesu i zadanie do scrumboarda na podstawie szablonu
     */
    async addNewProjectEmployersAssociationsInDb(externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        if (this._employers) {
            for (const entity of this._employers) {
                const item = new ProjectEntity({ _project: this, _entity: entity, projectRole: 'EMPLOYER' });
                await item.addInDb(externalConn, isPartOfTransaction);
            }
        }
    }
    /*
     * jest wywoływana w addNewProject()
     * tworzy instancję procesu i zadanie do scrumboarda na podstawie szablonu
     */
    async addNewProjectEngineersAssociationsInDb(externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        if (this._engineers) {
            for (const entity of this._engineers) {
                const item = new ProjectEntity({ _project: this, _entity: entity, projectRole: 'ENGINEER' });
                await item.addInDb(externalConn, isPartOfTransaction);
            }
        }
    }
    /*
     * jest wywoływana w editCase()
     * kasuje Instancje procesu i zadanie ramowe, potem tworzy je nanowo dla nowego typu sprawy
     */
    async editProjectEntitiesAssociationsInDb(externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        await this.deleteProjectEntityAssociations(externalConn, isPartOfTransaction);
        await this.addNewProjectEmployersAssociationsInDb(externalConn, isPartOfTransaction);
        await this.addNewProjectEngineersAssociationsInDb(externalConn, isPartOfTransaction);
    }
    async deleteProjectEntityAssociations(externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const sql = `DELETE FROM Projects_Entities WHERE ProjectId =?`;
        return await ToolsDb.executePreparedStmt(sql, [ToolsDb.prepareValueToSql(this.id)], this);

    }

    async addInDb() {
        const conn: mysql.PoolConnection = await ToolsDb.pool.getConnection();
        await conn.beginTransaction();
        let project = await super.addInDb(conn, true);
        await this.addNewProjectEmployersAssociationsInDb(conn, true);
        await this.addNewProjectEngineersAssociationsInDb(conn, true);
        await conn.commit();
        return project;
    }

    async editInDb() {
        const conn: mysql.PoolConnection = await ToolsDb.pool.getConnection();
        await conn.beginTransaction();

        const res = await Promise.all([
            super.editInDb(conn, true),
            this.editProjectEntitiesAssociationsInDb(conn, true)
        ]);
        await conn.commit();
        return res[0];
    }
}
