import BusinessObject from '../../BussinesObject';
import ToolsDate from '../../tools/ToolsDate';
import ToolsDb from '../../tools/ToolsDb';
import ToolsGd from '../../tools/ToolsGd';
import Contract from '../Contract';
import CaseType from './cases/caseTypes/CaseType';
import MilestoneType from './milestoneTypes/MilestoneType';
import { OAuth2Client } from 'google-auth-library';
import { drive_v3, google } from 'googleapis';
import Setup from '../../setup/Setup';
import ToolsSheets from '../../tools/ToolsSheets';
import Tools from '../../tools/Tools';
import ScrumSheet from '../../ScrumSheet/ScrumSheet';
import Case from './cases/Case';
import CaseTemplate from './cases/caseTemplates/CaseTemplate';
import mysql from 'mysql2/promise';
import Task from './cases/tasks/Task';
import ProcessInstance from '../../processes/processInstances/ProcessInstance';

export default class Milestone extends BusinessObject {
    id?: number;
    _tmpId?: string;
    number: number | undefined;
    name: string;
    _folderNumber?: string;
    description: string;
    startDate?: string;
    endDate?: string;
    status: string;
    typeId: string;
    _type: MilestoneType;
    contractId?: number;
    _parent: Contract;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    _folderName?: string;
    isOur?: boolean;
    _FolderNumber_TypeName_Name?: string;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'Milestones' })
        this.id = initParamObject.id;
        //id tworzone tymczosowo po stronie klienta do obsługi tymczasowego wiersza resultsecie
        this._tmpId = initParamObject._tmpId;
        this.number = initParamObject.number;
        this.name = initParamObject.name;
        this._folderNumber = initParamObject._folderNumber;
        this.description = initParamObject.description || '';

        this.startDate = ToolsDate.dateJsToSql(initParamObject.startDate || initParamObject._parent.startDate);
        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate || initParamObject._parent.endDate);
        this.status = initParamObject.status;
        if (initParamObject.gdFolderId)
            this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
        this.typeId = initParamObject._type.id;
        this._type = initParamObject._type;
        this.setFolderName();
        this._FolderNumber_TypeName_Name = initParamObject._type._folderNumber + ' ' + initParamObject._type.name + ' | ' + initParamObject.name;

        this.contractId = initParamObject._parent.id;
        this._parent = initParamObject._parent;
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }

    private async setNumber() {
        if (!this._type.isUniquePerContract) {
            const sql = `SELECT COUNT(*) AS PrevNumber FROM Cases WHERE Cases.TypeId=${this.typeId}`;

            const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
            try {
                var row = result[0];
                return <number>row.PrevNumber + 1;
            } catch (err) {
                throw err;
            }
        }
    }
    setFolderName() {
        if (this._type.isUniquePerContract)
            this._folderName = this._type._folderNumber + ' ' + this._type.name;
        else
            this._folderName = this._type._folderNumber + '_' + this.number + ' ' + this._type.name + ' ' + this.name;
    }

    /*
     * Służy do tworzenia domyślnych folderów przy dodawaniu pojedynczego milesotna 
     */
    async createFolders(auth: OAuth2Client) {
        this.number = await this.setNumber();
        this.setFolderName();
        const folder = await ToolsGd.setFolder(auth, { parentId: <string>this._parent?.gdFolderId, name: <string>this._folderName })
        this.setGdFolderIdAndUrl(folder.id as string);

        const caseTypes = await this.getCaseTypes();
        const promises = [];
        for (const caseType of caseTypes) {
            promises.push(ToolsGd.setFolder(auth, { parentId: <string>folder.id, name: caseType._folderName }));
        }
        await Promise.all(promises);
        return folder;
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

    async createDefaultCases(auth: OAuth2Client, parameters?: { isPartOfBatch: boolean }) {
        const defaultCaseItems: Case[] = [];

        const defaultCaseTemplates = await this.getCaseTemplates({ isDefaultOnly: true });
        if (defaultCaseTemplates.length == 0 && this.isOur) throw new Error(
            'Typ kontraktu, który próbujesz dodać nie ma przypisanego żadnego szablonu sprawy!\n' +
            'Zgłoś administratorowi potrzebę utworzenia szablonów spraw i zadań'
        );
        console.log('templates loaded');
        for (const template of defaultCaseTemplates) {
            const caseItem = new Case({
                name: template.name,
                description: template.description,
                _type: template._caseType,
                _parent: this
            });
            //zasymuluj numer sprawy nieunikalnej. UWAGA: założenie, że przy dodawaniu spraw domyślnych nie będzie więcej niż jedna sprawa tego samego typu
            if (!caseItem._type.isUniquePerMilestone) {
                caseItem.number = 1;
                caseItem.setDisplayNumber();
            }
            await caseItem.createFolder(auth);
            defaultCaseItems.push(caseItem);
        }
        console.log('folders created');
        const caseData = await this.addDefaultCasesInDb(defaultCaseItems);
        console.log('saved in db');

        await this.addDefaultCasesInScrum(auth, {
            casesData: <any>caseData,
            isPartOfBatch: parameters?.isPartOfBatch
        });
        console.log('added in scrum');
    }

    private async addDefaultCasesInDb(caseItems: Case[], externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        const caseData = [];
        const conn = (externalConn) ? externalConn : await ToolsDb.pool.getConnection();
        await conn.beginTransaction();
        for (const caseItem of caseItems)
            caseData.push(caseItem.addInDb(conn, true));
        await conn.commit();
        return await Promise.all(caseData)
    }

    private async addDefaultCasesInScrum(auth: OAuth2Client, parameters: {
        casesData: [{
            caseItem: Case, processInstances: ProcessInstance[] | undefined, defaultTasksInDb: Task[]
        }],
        isPartOfBatch?: boolean
    }) {
        for (const caseData of parameters.casesData)
            await caseData.caseItem.addInScrum(auth, {
                defaultTasks: caseData.defaultTasksInDb,
                isPartOfBatch: parameters.isPartOfBatch
            });
    }

    async editInScrum(auth: OAuth2Client) {
        let currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.CurrentSprint.name
        })).values;

        const milestoneColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.milestoneIdColName);

        const milestoneNameColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.milestoneNameColName) + 1;
        const firstRow = Tools.findFirstInRange(<number>this.id, currentSprintValues, milestoneColNumber);
        const values = [];
        if (firstRow) {
            const lastRow = <number>Tools.findLastInRange(<number>this.id, currentSprintValues, milestoneColNumber);
            for (let i = firstRow; i <= lastRow; i++) {
                const nameCaption = (this.name) ? ` | ${this.name}` : '';
                const caption = `=HYPERLINK("${this._gdFolderUrl}";"${this._type._folderNumber} ${this._type.name}${nameCaption}")`;
                values.push(caption);
            }
            await ToolsSheets.updateValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: `${Setup.ScrumSheet.CurrentSprint.name}!${ToolsSheets.R1C1toA1(firstRow + 1, milestoneNameColNumber)}`,
                values: [values],
                majorDimension: 'COLUMNS'
            });
        }
    }
    async deleteFolder(auth: OAuth2Client) {
        const drive = google.drive({ version: 'v3', auth });
        const filesSchema = await drive.files.get({ fileId: this.gdFolderId, fields: 'id, ownedByMe', });
        console.log(filesSchema.data)
        if (filesSchema.data.ownedByMe)
            await ToolsGd.trashFile(auth, filesSchema.data.id as string);
        else
            await ToolsGd.updateFolder(auth, { id: this.gdFolderId, name: `${this._folderName} - USUŃ` });
    }

    async deleteFromScrum(auth: OAuth2Client) {
        let currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.CurrentSprint.name
        })).values;
        const milestoneColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.milestoneIdColName);

        const firstRow = Tools.findFirstInRange(<number>this.id, currentSprintValues, milestoneColIndex);
        if (firstRow) {
            const lastRow = <number>Tools.findLastInRange(<number>this.id, currentSprintValues, milestoneColIndex);
            await ToolsSheets.deleteRows(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                sheetId: Setup.ScrumSheet.CurrentSprint.id,
                startIndex: firstRow,
                endIndex: lastRow + 1
            });

            if (lastRow < 13) {
                ScrumSheet.CurrentSprint.makeTimesSummary(auth);
            }
        }
    }

    async getCaseTypes() {
        const sql = `SELECT  CaseTypes.Id,
            CaseTypes.Name,
            CaseTypes.FolderNumber,
            CaseTypes.IsInScrumByDefault,
            MilestoneTypes.Id AS MilestoneTypeId,
            MilestoneTypes.Name AS MilestoneTypeName,
            MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber,
            MilestoneTypes_ContractTypes.IsDefault AS MilestoneTypeIsDefault
            FROM CaseTypes
            JOIN MilestoneTypes ON MilestoneTypes.Id=CaseTypes.MilestoneTypeId AND MilestoneTypes.Id=${this._type.id}
            JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId = MilestoneTypes.Id AND MilestoneTypes_ContractTypes.ContractTypeId= ${this._parent._type.id} 
            ORDER BY MilestoneTypeId`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        try {
            const newResult: CaseType[] = [];
            for (const row of result) {
                const item = new CaseType({
                    id: row.Id,
                    name: row.Name,
                    folderNumber: row.FolderNumber,
                    isInScrumByDefault: row.IsInScrumByDefault,
                    _milestoneType: new MilestoneType({
                        id: row.MilestoneTypeId,
                        name: row.MilestoneTypeName,
                        _folderNumber: row.MilestoneTypeFolderNumber,
                        _isDefault: row.MilestoneTypeIsDefault
                    })
                });

                newResult.push(item);
            }
            return newResult;
        } catch (err) {
            throw err;
        }
    }

    async getCaseTemplates(initParamObject: { isDefaultOnly?: boolean, isInScrumByDefaultOnly?: boolean }) {
        const isDefaultCondition = (initParamObject.isDefaultOnly) ? 'CaseTypes.IsDefault=TRUE' : '1';
        const isInScrumDefaultCondition = (initParamObject.isInScrumByDefaultOnly) ? 'CaseTypes.IsInScrumByDefault=TRUE' : '1';
        const sql = 'SELECT CaseTemplates.Id, \n \t' +
            'CaseTemplates.Name, \n \t' +
            'CaseTemplates.Description, \n \t' +
            'CaseTypes.Id AS CaseTypeId, \n \t' +
            'CaseTypes.Name AS CaseTypeName, \n \t' +
            'CaseTypes.FolderNumber AS CaseTypeFolderNumber, \n \t' +
            'CaseTypes.IsInScrumByDefault  AS CaseTypeIsInScrumByDefault, \n \t' +
            'CaseTypes.IsUniquePerMilestone  AS CaseTypeIsUniquePerMilestone, \n \t' +
            'CaseTypes.IsDefault AS CaseTypeIsDefault, \n \t' +
            'MilestoneTypes.Id AS MilestoneTypeId, \n \t' +
            'MilestoneTypes.Name AS MilestoneTypeName, \n \t' +
            'NULL AS MilestoneTypeIsDefault \n' + //parametr niedostępny
            'FROM CaseTemplates \n' +
            'JOIN CaseTypes ON CaseTypes.Id=CaseTemplates.CaseTypeId \n' +
            'JOIN MilestoneTypes ON CaseTypes.MilestoneTypeId=MilestoneTypes.Id \n' +
            'WHERE ' + isDefaultCondition + ' AND ' + isInScrumDefaultCondition + ' AND MilestoneTypes.Id=' + this._type.id;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        try {
            const newResult: CaseTemplate[] = [];
            for (const row of result) {
                const item = new CaseTemplate({
                    id: row.Id,
                    name: row.Name,
                    description: row.Description,
                    _caseType: new CaseType({
                        id: row.CaseTypeId,
                        name: row.CaseTypeName,
                        folderNumber: row.CaseTypeFolderNumber,
                        isDefault: row.CaseTypeIsDefault,
                        isInScrumByDefault: row.CaseTypeIsInScrumByDefault,
                        isUniquePerMilestone: row.CaseTypeIsUniquePerMilestone,
                        _milestoneType: new MilestoneType({
                            id: row.MilestoneTypeId,
                            name: row.MilestoneTypeName,
                            _isDefault: row.MilestoneTypeIsDefault
                        })
                    }),

                });

                newResult.push(item);
            }
            return newResult;
        } catch (err) {
            throw err;
        }
    }
}