import ToolsGd from '../tools/ToolsGd';
import ToolsDate from '../tools/ToolsDate';
import { auth, OAuth2Client } from 'google-auth-library';
import Project from '../projects/Project';
import Entity from '../entities/Entity';
import ContractType from './contractTypes/ContractType';
import mysql from 'mysql2/promise';
import Person from '../persons/Person';
import BusinessObject from '../BussinesObject';
import ToolsDb from '../tools/ToolsDb';
import ContractEntity from './ContractEntity';
import ScrumSheet from '../ScrumSheet/ScrumSheet';
import Milestone from './milestones/Milestone';
import MilestonesController from './milestones/MilestonesController';
import MilestoneTemplatesController from './milestones/milestoneTemplates/MilestoneTemplatesController';
import { google } from 'googleapis';
import TasksController from './milestones/cases/tasks/TasksController';

export default abstract class Contract extends BusinessObject {
    id?: number;
    alias?: string;
    typeId: number;
    _type: ContractType;
    _tmpId?: any;
    number: string;
    name: string;
    projectOurId: string;
    startDate?: string;
    endDate?: string;
    value: any;
    comment: string;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    meetingProtocolsGdFolderId?: string;
    _ourIdOrNumber_Name?: string;
    _ourIdOrNumber_Alias?: string;
    _contractors: Entity[];
    _engineers: Entity[];
    _employers: Entity[];
    status: string;
    _parent: Project;
    _folderName?: string;

    constructor(initParamObject: any, conn?: mysql.PoolConnection) {
        super({ _dbTableName: 'Contracts' });
        this.id = initParamObject.id;
        this.alias = initParamObject.alias;
        this.typeId = initParamObject._type.id;
        this._type = initParamObject._type;
        //id tworzone tymczasowo po stronie klienta do obsługi tymczasowego wiersza resultsecie
        this._tmpId = initParamObject._tmpId;
        this.number = initParamObject.number;
        this.name = initParamObject.name;

        this.projectOurId = initParamObject.projectId;
        this.startDate = ToolsDate.dateJsToSql(initParamObject.startDate);
        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate);

        this.value = initParamObject.value;
        this.comment = initParamObject.comment;

        if (initParamObject.gdFolderId)
            this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
        this.meetingProtocolsGdFolderId = initParamObject.meetingProtocolsGdFolderId;

        this._contractors = (initParamObject._contractors) ? initParamObject._contractors : [];

        this._engineers = (initParamObject._engineers) ? initParamObject._engineers : [];
        this._employers = (initParamObject._employers) ? initParamObject._employers : [];

        this._parent = initParamObject._parent;
        this.status = initParamObject.status;
    }
    /**batch dla dodawania kontraktów */
    async initialise(auth: OAuth2Client) {
        try {
            console.group(`Creating a new Contract ${this.id}`)
            await this.createFolders(auth);
            console.log('Contract folders created');
            await this.addInDb();
            console.log('Contract added in db');
            await this.addInScrum(auth);
            console.log('Contract added in scrum');
            console.group('Creating default milestones');
            await this.createDefaultMilestones(auth);
            console.log('Default milestones created');
            console.groupEnd();
            console.log(`Contract ${this._ourIdOrNumber_Alias} created`);
        } catch (error) {
            console.group('Error while creating contract');
            this.deleteFolder(auth);
            console.log('folders deleted');
            this.deleteFromScrum(auth);
            console.log('deleted from scrum');
            console.groupEnd();
            throw error;
        }
    }
    async edit(auth: OAuth2Client) {

    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }

    setEntitiesFromParent() {
        if (this._employers.length == 0)
            this._employers = this._parent._employers;
    }

    async createFolders(auth: OAuth2Client) {
        const folder = await ToolsGd.setFolder(auth, { parentId: <string>this._parent?.gdFolderId, name: <string>this._folderName })
        this.setGdFolderIdAndUrl(folder.id as string);
        const meetingNotesFolder = await ToolsGd.setFolder(auth, { parentId: <string>this._parent.gdFolderId, name: 'Notatki ze spotkań' });
        this.meetingProtocolsGdFolderId = <string>meetingNotesFolder.id;
    }

    async addEntitiesAssociationsInDb(externalConn: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const entityAssociations: ContractEntity[] = [];
        this._contractors.map((item) => {
            entityAssociations.push(new ContractEntity({
                contractRole: 'CONTRACTOR',
                _contract: this,
                _entity: item
            }));
        });
        this._engineers.map((item) => {
            entityAssociations.push(new ContractEntity({
                contractRole: 'ENGINEER',
                _contract: this,
                _entity: item
            }));
        });
        this._employers.map((item) => {
            entityAssociations.push(new ContractEntity({
                contractRole: 'EMPLOYER',
                _contract: this,
                _entity: item
            }));
        });
        for (const association of entityAssociations) {
            association.addInDb(externalConn, isPartOfTransaction);
        }
    }
    /*
     * jest wywoływana w editCase()
     * kasuje Instancje procesu i zadanie ramowe, potem tworzy je nanowo dla nowego typu sprawy
     */
    async editEntitiesAssociationsInDb(externalConn: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        await this.deleteEntitiesAssociationsFromDb();
        await this.addEntitiesAssociationsInDb(externalConn, isPartOfTransaction);
    }

    async deleteEntitiesAssociationsFromDb() {
        const sql = `DELETE FROM Contracts_Entities WHERE ContractId =?`;
        return await ToolsDb.executePreparedStmt(sql, [this.id], this);
    }

    async createDefaultMilestones(auth: OAuth2Client) {
        const defaultMilestones: Milestone[] = [];

        const defaultMilestoneTemplates = await MilestoneTemplatesController.getMilestoneTemplatesList({
            isDefaultOnly: true,
            contractTypeId: this.typeId
        });
        for (const template of defaultMilestoneTemplates) {
            const milestone = new Milestone({
                name: template.name,
                description: template.description,
                _type: template._milestoneType,
                _parent: this,
                status: 'Nie rozpoczęty'
            });
            //zasymuluj numer kamienia nieunikalnego. 
            //UWAGA: założenie, że przy dodawaniu kamieni domyślnych nie będzie więcej niż jeden tego samego typu
            if (!milestone._type.isUniquePerContract) {
                milestone.number = 1;
            }
            await milestone.createFolders(auth);
            console.log('folders creataed');
            defaultMilestones.push(milestone);
        }
        console.log('templates loaded');
        await this.addDefaultMilestonesInDb(defaultMilestones);
        console.log('milestones saved in db');
        console.groupCollapsed('creating default cases');
        for (const milestone of defaultMilestones)
            await milestone.createDefaultCases(auth, { isPartOfBatch: true });
        console.groupEnd();
    }

    private async addDefaultMilestonesInDb(milestones: Milestone[], externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const conn = (externalConn) ? externalConn : await ToolsDb.pool.getConnection();
        await conn.beginTransaction();
        const promises = [];
        for (const milestone of milestones)
            promises.push(milestone.addInDb(conn, true));
        await Promise.all(promises)
        await conn.commit();
    }

    async addInDb() {
        return await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            const contract = await super.addInDb(conn, true);
            await this.addEntitiesAssociationsInDb(conn, true);
        });
    }

    async editInDb() {
        const res = await ToolsDb.transaction(async conn => {
            await super.editInDb(conn, true);
            await this.editEntitiesAssociationsInDb(conn, true)
        });
    }
    async editFolder(auth: OAuth2Client) {
        //sytuacja normalna - folder itnieje
        if (this.gdFolderId) {
            try {
                await ToolsGd.getFileOrFolderById(auth, this.gdFolderId);
            } catch (err) {
                return await this.createFolders(auth);
            }
            return await ToolsGd.updateFolder(auth, { name: this._folderName, id: this.gdFolderId });
        }
        //kamień nie miał wcześniej typu albo coś poszło nie tak przy tworzeniu folderu
        else
            return await this.createFolders(auth);
    }

    async deleteFolder(auth: OAuth2Client) {
        ToolsGd.deleteFileOrFolder(auth, <string>this.gdFolderId);
    }

    async getTasks() {
        return await TasksController.getTasksList({ contractId: this.id });
    }

    async addTasksInScrum(auth: OAuth2Client) {
        const tasks = await this.getTasks();
        const conn: mysql.PoolConnection = await ToolsDb.pool.getConnection();
        for (const task of tasks) {
            await task.addInScrum(auth, conn, true);
        }
        conn.release();
    }

    /** dodaje wiesz nagowka kontraktu */
    abstract deleteFromScrum(auth: OAuth2Client): void;
    abstract addInScrum(auth: OAuth2Client): void;
    abstract setFolderName(): void;
    abstract shouldBeInScrum(): Promise<boolean>;
}