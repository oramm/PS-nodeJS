import ToolsGd from '../tools/ToolsGd';
import ToolsDate from '../tools/ToolsDate';
import { OAuth2Client } from 'google-auth-library';
import Project from '../projects/Project';
import Entity from '../entities/Entity';
import ContractType from './contractTypes/ContractType';
import mysql from 'mysql2/promise';
import BusinessObject from '../BussinesObject';
import ToolsDb from '../tools/ToolsDb';
import ContractEntity from './ContractEntity';
import Milestone from './milestones/Milestone';
import MilestoneTemplatesController from './milestones/milestoneTemplates/MilestoneTemplatesController';
import TasksController from './milestones/cases/tasks/TasksController';

export default abstract class Contract extends BusinessObject {
    id?: number;
    alias?: string;
    typeId: number;
    _type: ContractType;
    _tmpId?: any;
    number: string;
    name: string = '';
    projectOurId: string;
    startDate?: string;
    endDate?: string;
    guaranteeEndDate?: string;
    value?: string | number;
    _remainingValue?: string | number;
    comment: string;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    meetingProtocolsGdFolderId?: string;
    _ourIdOrNumber_Name?: string;
    _ourIdOrNumber_Alias?: string;
    _contractors?: Entity[];
    _engineers?: Entity[];
    _employers?: Entity[];
    status: string;
    _parent: Project;
    _folderName?: string;
    _lastUpdated?: string;

    constructor(initParamObject: any, conn?: mysql.PoolConnection) {
        super({ _dbTableName: 'Contracts' });
        this.id = initParamObject.id;
        this.alias = initParamObject.alias;
        this.typeId = initParamObject._type?.id;
        this._type = initParamObject._type;
        //id tworzone tymczasowo po stronie klienta do obsługi tymczasowego wiersza resultsecie
        this._tmpId = initParamObject._tmpId;
        this.number = initParamObject.number;
        this.name = initParamObject.name;

        this.startDate = ToolsDate.dateJsToSql(initParamObject.startDate);
        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate);
        this.guaranteeEndDate = ToolsDate.dateJsToSql(initParamObject.guaranteeEndDate);
        if (initParamObject.value) {
            if (typeof initParamObject.value === 'string') {
                initParamObject.value = initParamObject.value
                    .replace(/\s/g, '')
                    .replace(/,/g, '.')
                    .replace(/[^0-9.]/g, '');
                this.value = parseFloat(initParamObject.value);
            } else {
                this.value = initParamObject.value;
            }
        }
        if (initParamObject._remainingValue) {
            if (typeof initParamObject._remainingValue === 'string') {
                initParamObject._remainingValue = initParamObject._remainingValue
                    .replace(/\s/g, '')
                    .replace(/,/g, '.')
                    .replace(/[^0-9.]/g, '');
                this._remainingValue = parseFloat(initParamObject._remainingValue);
            } else {
                this._remainingValue = initParamObject._remainingValue;
            }
        }
        this.comment = initParamObject.comment;

        if (initParamObject.gdFolderId)
            this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
        this.meetingProtocolsGdFolderId = initParamObject.meetingProtocolsGdFolderId;

        this._contractors = (initParamObject._contractors) ? initParamObject._contractors : [];

        this._engineers = (initParamObject._engineers) ? initParamObject._engineers : [];
        this._employers = (initParamObject._employers) ? initParamObject._employers : [];

        this._parent = initParamObject._parent;
        this.projectOurId = this._parent?.ourId;;

        this.status = initParamObject.status;
        this._lastUpdated = initParamObject._lastUpdated;
    }
    /**batch dla dodawania kontraktów */
    async addNewController(auth: OAuth2Client) {
        if (await this.isUnique())
            throw new Error(`Kontrakt ${this._ourIdOrNumber_Name} już istnieje.`);

        try {
            console.group(`Creating a new Contract ${this.id}`);
            await this.createFolders(auth);
            console.log('Contract folders created');
            await this.addInDb();
            console.log('Contract added in db');
            await this.addInScrum(auth);
            console.log('Contract added in scrum');
            console.group('Creating default milestones');
            await this.createDefaultMilestones(auth);
            console.log('Default milestones, cases & tasks created');
            console.groupEnd();
            console.log(`Contract ${this._ourIdOrNumber_Alias} created`);
        } catch (error) {
            console.group('Error while creating contract');
            this.deleteFolder(auth)
                .then(() => console.log('folders deleted'));
            this.deleteFromScrum(auth)
                .then(() => console.log('deleted from scrum'));

            if (this.id) this.deleteFromDb()
                .then(() => console.log('deleted from db'));
            console.groupEnd();
            throw error;
        }
    }
    /**batch dla edycji kontraktów */
    async editHandler(auth: OAuth2Client, fieldsToUpdate: string[] = []) {
        console.group(`Editing contract ${this._ourIdOrNumber_Name}`);
        const onlyDbfields = ['status', 'comment', 'startDate', 'endDate', 'guaranteeEndDate', 'value', 'name'];
        const isOnlyDbFields = fieldsToUpdate.length > 0 && fieldsToUpdate.every(field => onlyDbfields.includes(field));

        const promises = [
            this.editInDb(undefined, undefined, fieldsToUpdate).then(() => console.log('Contract edited in db'))
        ];
        if (!isOnlyDbFields) promises.push(
            this.editFolder(auth).then(() => console.log('Contract folder edited')),
            this.editInScrum(auth).then(() => console.log('Contract edited in scrum'))
        );
        await Promise.all(promises);
        console.groupEnd();
    }


    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }

    setEntitiesFromParent() {
        if (this._employers?.length == 0)
            this._employers = this._parent._employers;
    }
    async setContractRootFolder(auth: OAuth2Client) {
        return await ToolsGd.setFolder(auth, { parentId: <string>this._parent?.gdFolderId, name: <string>this._folderName });
    }

    async createFolders(auth: OAuth2Client) {
        const folder = await this.setContractRootFolder(auth);
        this.setGdFolderIdAndUrl(folder.id as string);
        const meetingNotesFolder = await ToolsGd.setFolder(auth, { parentId: <string>this._parent.gdFolderId, name: 'Notatki ze spotkań' });
        this.meetingProtocolsGdFolderId = <string>meetingNotesFolder.id;
    }

    async addEntitiesAssociationsInDb(externalConn: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const entityAssociations: ContractEntity[] = [];
        this._contractors?.map((item) => {
            entityAssociations.push(new ContractEntity({
                contractRole: 'CONTRACTOR',
                _contract: this,
                _entity: item
            }));
        });
        this._engineers?.map((item) => {
            entityAssociations.push(new ContractEntity({
                contractRole: 'ENGINEER',
                _contract: this,
                _entity: item
            }));
        });
        this._employers?.map((item) => {
            entityAssociations.push(new ContractEntity({
                contractRole: 'EMPLOYER',
                _contract: this,
                _entity: item
            }));
        });
        for (const association of entityAssociations) {
            await association.addInDb(externalConn, isPartOfTransaction);
        }
    }
    /**jest wywoływana w editCase()
     * kasuje Instancje procesu i zadanie ramowe, potem tworzy je nanowo dla nowego typu sprawy
     */
    async editEntitiesAssociationsInDb(externalConn: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        await this.deleteEntitiesAssociationsFromDb(externalConn, isPartOfTransaction);
        await this.addEntitiesAssociationsInDb(externalConn, isPartOfTransaction);
    }

    async deleteEntitiesAssociationsFromDb(externalConn: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const sql = `DELETE FROM Contracts_Entities WHERE ContractId =?`;
        return await ToolsDb.executePreparedStmt(sql, [this.id], this, externalConn, isPartOfTransaction);
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
            defaultMilestones.push(milestone);
        }
        console.log('Milestones folders creataed');
        await this.addDefaultMilestonesInDb(defaultMilestones);
        console.log('default milestones saved in db');

        for (const milestone of defaultMilestones) {
            console.group(`--- creating default cases for milestone ${milestone._FolderNumber_TypeName_Name} ...`);
            await milestone.createDefaultCases(auth, { isPartOfBatch: true });
        }
        console.groupEnd();
    }

    private async addDefaultMilestonesInDb(milestones: Milestone[], externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        if (!externalConn && isPartOfTransaction) throw new Error('Transaction is not possible without external connection');
        const conn = (externalConn) ? externalConn : await ToolsDb.getPoolConnectionWithTimeout();
        if (!externalConn) console.log('new connection:: addDefaultMilestonesInDb ', conn.threadId);
        try {
            await conn.beginTransaction();
            const promises = [];
            for (const milestone of milestones)
                promises.push(milestone.addInDb(conn, true));
            await Promise.all(promises)
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            if (!externalConn) { conn.release(); console.log('connection released:: addDefaultMilestonesInDb', conn.threadId); }
        }
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
        ToolsGd.trashFileOrFolder(auth, <string>this.gdFolderId);
    }

    async getTasks() {
        return await TasksController.getTasksList({ contractId: this.id });
    }
    /**dodaje isteniejące zadania  */
    async addExistingTasksInScrum(auth: OAuth2Client) {
        let conn: mysql.PoolConnection | null = null;
        try {
            const tasks = await this.getTasks();
            console.log(`adding ${tasks.length} tasks in scrum`);
            conn = await ToolsDb.pool.getConnection();
            for (const task of tasks) {
                await task.addInScrum(auth, conn, true);
            }
        } catch (error) {
            console.error('An error occurred:', error);
        } finally {
            if (conn) {
                conn.release();
            }
        }
    }


    /** dodaje wiesz nagowka kontraktu */
    abstract deleteFromScrum(auth: OAuth2Client): Promise<void>;
    abstract addInScrum(auth: OAuth2Client): Promise<void>;
    abstract editInScrum(auth: OAuth2Client): Promise<void>;
    abstract setFolderName(): void;
    abstract shouldBeInScrum(): Promise<boolean>;
    abstract isUnique(): Promise<boolean>;
}