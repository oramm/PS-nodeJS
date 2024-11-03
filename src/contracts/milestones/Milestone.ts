import BusinessObject from '../../BussinesObject';
import ToolsDate from '../../tools/ToolsDate';
import ToolsDb from '../../tools/ToolsDb';
import ToolsGd from '../../tools/ToolsGd';
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
import ContractsController from '../ContractsController';
import {
    ExternalOfferData,
    MilestoneData,
    OfferData,
    OtherContractData,
    OurContractData,
    OurOfferData,
} from '../../types/types';

export default class Milestone extends BusinessObject implements MilestoneData {
    id?: number;
    _tmpId?: string;
    number: number | undefined;
    name: string;
    _folderNumber?: string;
    description: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    typeId: string;
    _type: MilestoneType;
    contractId?: number;
    offerId?: number;
    _contract?: OurContractData | OtherContractData;
    _offer?: OurOfferData | ExternalOfferData;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    _folderName?: string;
    isOur?: boolean;
    _FolderNumber_TypeName_Name?: string;

    constructor(initParamObject: MilestoneData) {
        super({ ...initParamObject, _dbTableName: 'Milestones' });
        if (!initParamObject._contract && !initParamObject._offer)
            throw new Error('Contract or offer is not defined for Milestone');

        this.id = initParamObject.id;
        this.number = initParamObject.number;
        this.name = initParamObject.name;
        this._folderNumber = initParamObject._folderNumber;
        this.description = initParamObject.description || '';
        const startDateRaw =
            initParamObject.startDate || initParamObject._contract?.startDate;
        if (typeof startDateRaw === 'string') {
            this.startDate = ToolsDate.dateJsToSql(startDateRaw);
        }
        const endDateRaw =
            initParamObject.endDate || initParamObject._contract?.endDate;
        if (typeof endDateRaw === 'string') {
            this.endDate = ToolsDate.dateJsToSql(endDateRaw);
        }

        this.status = initParamObject.status;
        if (initParamObject.gdFolderId)
            this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
        this.typeId = initParamObject._type.id;
        this._type = initParamObject._type;
        this.setFolderName();
        this._FolderNumber_TypeName_Name =
            initParamObject._type._folderNumber +
            ' ' +
            initParamObject._type.name +
            ' | ' +
            initParamObject.name;

        this.contractId = initParamObject._contract?.id;
        this.offerId = initParamObject._offer?.id;
        this._contract = initParamObject._contract;
        this._offer = initParamObject._offer;
    }

    async deleteController(auth: OAuth2Client) {
        console.group('Deleting Milestone', this.id);
        await this.deleteFromDb();
        await Promise.all([
            this.deleteFolder(auth),
            this.deleteFromScrum(auth),
        ]);
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }

    private async setNumber() {
        if (!this._type.isUniquePerContract) {
            const sql = `SELECT COUNT(*) AS PrevNumber FROM Cases WHERE Cases.TypeId=${this.typeId}`;

            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            try {
                var row = result[0];
                return <number>row.PrevNumber + 1;
            } catch (err) {
                throw err;
            }
        }
    }

    async getParentContractFromDb() {
        if (!this._contract?.id)
            throw new Error('parent Contract does not have Id');
        return (
            await ContractsController.getContractsList([
                { id: this._contract.id },
            ])
        )[0];
    }

    setFolderName() {
        if (this._type.isUniquePerContract)
            this._folderName = this._type._folderNumber + ' ' + this._type.name;
        else
            this._folderName =
                this._type._folderNumber +
                '_' +
                this.number +
                ' ' +
                this._type.name +
                ' ' +
                this.name;
    }
    /** sprawdza czy folder istnieje
     */
    async checkFolder(auth: OAuth2Client) {
        return (
            this.gdFolderId != undefined &&
            this.gdFolderId != '' &&
            (await ToolsGd.fileOrFolderExists(auth, this.gdFolderId))
        );
    }

    /**
     * Służy do tworzenia domyślnych folderów przy dodawaniu pojedynczego milestona
     */
    async createFolders(auth: OAuth2Client) {
        const parentGdId =
            this._contract?.gdFolderId || this._offer?.gdFolderId;
        if (!parentGdId)
            throw new Error('Contract or Offer folder id is not defined');

        this.number = await this.setNumber();
        this.setFolderName();
        const folder = await ToolsGd.setFolder(auth, {
            parentId: parentGdId,
            name: <string>this._folderName,
        });
        this.setGdFolderIdAndUrl(folder.id as string);

        const caseTypes = await this.getCaseTypes();
        const promises = [];
        for (const caseType of caseTypes) {
            promises.push(
                ToolsGd.setFolder(auth, {
                    parentId: <string>folder.id,
                    name: caseType._folderName,
                })
            );
        }
        await Promise.all(promises);
        return folder;
    }

    async editFolder(auth: OAuth2Client) {
        //sytuacja normalna - folder itnieje
        if (await this.checkFolder(auth)) {
            try {
                await ToolsGd.getFileOrFolderMetaDataById(
                    auth,
                    <string>this.gdFolderId
                );
            } catch (err) {
                return await this.createFolders(auth);
            }
            return await ToolsGd.updateFolder(auth, {
                name: this._folderName,
                id: this.gdFolderId,
            });
        }
        //kamień nie miał wcześniej typu albo coś poszło nie tak przy tworzeniu folderu
        else return await this.createFolders(auth);
    }

    async createDefaultCases(
        auth: OAuth2Client,
        parameters?: { isPartOfBatch: boolean }
    ) {
        const defaultCaseItems: Case[] = [];

        const defaultCaseTemplates = await this.getCaseTemplates({
            isDefaultOnly: true,
        });
        if (defaultCaseTemplates.length == 0 && this.isOur)
            throw new Error(
                'Typ kontraktu, który próbujesz dodać nie ma przypisanego żadnego szablonu sprawy!\n' +
                    'Zgłoś administratorowi potrzebę utworzenia szablonów spraw i zadań'
            );
        for (const template of defaultCaseTemplates) {
            const caseItem = new Case({
                name: template.name,
                description: template.description,
                _type: template._caseType,
                _parent: this,
            });
            if (!caseItem._type) throw new Error('caseItem should have _type');
            //zasymuluj numer sprawy nieunikalnej. UWAGA: założenie, że przy dodawaniu spraw domyślnych nie będzie więcej niż jedna sprawa tego samego typu
            if (!caseItem._type.isUniquePerMilestone) {
                caseItem.number = 1;
                caseItem.setDisplayNumber();
            }
            await caseItem.createFolder(auth);
            defaultCaseItems.push(caseItem);
        }
        console.log('default cases folders created');
        const caseData = await this.addDefaultCasesInDb(defaultCaseItems);
        console.log('cases saved in db');

        await this.addDefaultCasesInScrum(auth, {
            casesData: <any>caseData,
            isPartOfBatch: parameters?.isPartOfBatch,
        });
        console.log('milestone added in scrum');
    }

    private async addDefaultCasesInDb(caseItems: Case[]) {
        const caseData = [];
        let conn: mysql.PoolConnection | undefined;
        try {
            conn = await ToolsDb.getPoolConnectionWithTimeout();
            console.log(
                'new connection created for adding default cases in db',
                conn.threadId
            );
            await conn.beginTransaction();
            for (const caseItem of caseItems) {
                caseData.push(await caseItem.addInDb(conn, true));
            }
            await conn.commit();
            console.groupEnd();
        } catch (error) {
            console.error('An error occurred:', error);
            await conn?.rollback();
            throw error;
        } finally {
            conn?.release();
            console.log(
                'connection released after adding default cases in db ',
                conn?.threadId
            );
        }
        return await Promise.all(caseData);
    }

    private async addDefaultCasesInScrum(
        auth: OAuth2Client,
        parameters: {
            casesData: [
                {
                    caseItem: Case;
                    processInstances: ProcessInstance[] | undefined;
                    defaultTasksInDb: Task[];
                }
            ];
            isPartOfBatch?: boolean;
        }
    ) {
        for (const caseData of parameters.casesData)
            await caseData.caseItem.addInScrum(auth, {
                defaultTasks: caseData.defaultTasksInDb,
                isPartOfBatch: parameters.isPartOfBatch,
            });
    }

    async editInScrum(auth: OAuth2Client) {
        let currentSprintValues = <any[][]>(
            await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name,
            })
        ).values;

        const milestoneColNumber = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.milestoneIdColName
        );

        const milestoneNameColNumber =
            currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.milestoneNameColName
            ) + 1;
        const firstRow = Tools.findFirstInRange(
            <number>this.id,
            currentSprintValues,
            milestoneColNumber
        );
        const values = [];
        if (firstRow) {
            const lastRow = <number>(
                Tools.findLastInRange(
                    <number>this.id,
                    currentSprintValues,
                    milestoneColNumber
                )
            );
            for (let i = firstRow; i <= lastRow; i++) {
                const nameCaption = this.name ? ` | ${this.name}` : '';
                const caption = `=HYPERLINK("${this._gdFolderUrl}";"${this._type._folderNumber} ${this._type.name}${nameCaption}")`;
                values.push(caption);
            }
            await ToolsSheets.updateValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: `${
                    Setup.ScrumSheet.CurrentSprint.name
                }!${ToolsSheets.R1C1toA1(
                    firstRow + 1,
                    milestoneNameColNumber
                )}`,
                values: [values],
                majorDimension: 'COLUMNS',
            });
        }
    }
    async deleteFolder(auth: OAuth2Client) {
        const drive = google.drive({ version: 'v3', auth });
        const filesSchema = await drive.files.get({
            fileId: this.gdFolderId,
            fields: 'id, ownedByMe',
        });
        console.log(filesSchema.data);
        if (filesSchema.data.ownedByMe)
            await ToolsGd.trashFile(auth, filesSchema.data.id as string);
        else
            await ToolsGd.updateFolder(auth, {
                id: this.gdFolderId,
                name: `${this._folderName} - USUŃ`,
            });
    }

    async deleteFromScrum(auth: OAuth2Client) {
        let currentSprintValues = <any[][]>(
            await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name,
            })
        ).values;
        const milestoneColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.milestoneIdColName
        );

        const firstRow = Tools.findFirstInRange(
            <number>this.id,
            currentSprintValues,
            milestoneColIndex
        );
        if (firstRow) {
            const lastRow = <number>(
                Tools.findLastInRange(
                    <number>this.id,
                    currentSprintValues,
                    milestoneColIndex
                )
            );
            await ToolsSheets.deleteRows(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                sheetId: Setup.ScrumSheet.CurrentSprint.id,
                startIndex: firstRow,
                endIndex: lastRow + 1,
            });

            if (lastRow < 13) {
                ScrumSheet.CurrentSprint.makeTimesSummary(auth);
            }
        }
    }

    async getCaseTypes() {
        const contractTypeId = this._contract?._type.id;
        const offerTypeId = this._offer?._type.id;

        const sql = `SELECT 
            CaseTypes.Id,
            CaseTypes.Name,
            CaseTypes.FolderNumber,
            CaseTypes.IsInScrumByDefault,
            MilestoneTypes.Id AS MilestoneTypeId,
            MilestoneTypes.Name AS MilestoneTypeName,
            COALESCE(MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes_Offers.FolderNumber) AS MilestoneTypeFolderNumber,
            COALESCE(MilestoneTypes_ContractTypes.IsDefault, TRUE) AS MilestoneTypeIsDefault
            FROM CaseTypes
            JOIN MilestoneTypes ON MilestoneTypes.Id=CaseTypes.MilestoneTypeId AND MilestoneTypes.Id=${
                this._type.id
            }
            LEFT JOIN MilestoneTypes_ContractTypes 
                ON  MilestoneTypes_ContractTypes.MilestoneTypeId = MilestoneTypes.Id 
                AND MilestoneTypes_ContractTypes.ContractTypeId= ${
                    contractTypeId || 0
                } 
            LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes_Offers.MilestoneTypeId=MilestoneTypes.Id
            ORDER BY MilestoneTypeId`;

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
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
                        _isDefault: row.MilestoneTypeIsDefault,
                    }),
                });

                newResult.push(item);
            }
            return newResult;
        } catch (err) {
            throw err;
        }
    }

    async getCaseTemplates(initParamObject: {
        isDefaultOnly?: boolean;
        isInScrumByDefaultOnly?: boolean;
    }) {
        const isDefaultCondition = initParamObject.isDefaultOnly
            ? 'CaseTypes.IsDefault=TRUE'
            : '1';
        const isInScrumDefaultCondition = initParamObject.isInScrumByDefaultOnly
            ? 'CaseTypes.IsInScrumByDefault=TRUE'
            : '1';
        const sql = `SELECT CaseTemplates.Id,
            CaseTemplates.Name,
            CaseTemplates.Description,
            CaseTypes.Id AS CaseTypeId,
            CaseTypes.Name AS CaseTypeName,
            CaseTypes.FolderNumber AS CaseTypeFolderNumber,
            CaseTypes.IsInScrumByDefault  AS CaseTypeIsInScrumByDefault,
            CaseTypes.IsUniquePerMilestone  AS CaseTypeIsUniquePerMilestone,
            CaseTypes.IsDefault AS CaseTypeIsDefault,
            MilestoneTypes.Id AS MilestoneTypeId,
            MilestoneTypes.Name AS MilestoneTypeName,
            NULL AS MilestoneTypeIsDefault -- parametr niedostępny
            FROM CaseTemplates
            JOIN CaseTypes ON CaseTypes.Id=CaseTemplates.CaseTypeId
            JOIN MilestoneTypes ON CaseTypes.MilestoneTypeId=MilestoneTypes.Id
            WHERE ${isDefaultCondition} AND ${isInScrumDefaultCondition} AND MilestoneTypes.Id=${this._type.id}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        try {
            const newResult: CaseTemplate[] = [];
            for (const row of result) {
                const item = new CaseTemplate({
                    id: row.Id,
                    name: row.Name,
                    description: row.Description,
                    templateComment: '',
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
                            _isDefault: row.MilestoneTypeIsDefault,
                        }),
                    }),
                    caseTypeId: row.CaseTypeId,
                });

                newResult.push(item);
            }
            return newResult;
        } catch (err) {
            throw err;
        }
    }
}
