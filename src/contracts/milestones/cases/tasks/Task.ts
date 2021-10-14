import BusinessObject from '../../../../BussinesObject';
import Process from '../../../../processes/Process';
import ToolsDate from '../../../../tools/ToolsDate';
import ToolsDb from '../../../../tools/ToolsDb';
import TasksTemplateForProcesssController from './taskTemplates/TasksTemplatesForProcessesController';
import mysql from 'mysql2/promise';
import Setup from '../../../../setup/Setup';
import ToolsSheets from '../../../../tools/ToolsSheets';
import { OAuth2Client } from 'google-auth-library';
import Tools from '../../../../tools/Tools';
import Person from '../../../../persons/Person';
import Case from '../Case';
import ScrumSheet from '../../../../ScrumSheet/ScrumSheet';
import ToolsGd from '../../../../tools/ToolsGd';

export default class Task extends BusinessObject {
    id?: number;
    name?: string;
    description?: string;
    deadline?: string;
    status?: string;
    ownerId?: number;
    _owner?: any;
    caseId?: number;
    _parent?: any;
    scrumSheetRow?: any;
    ownerName?: string;
    rowStatus?: any;
    sheetRow?: any;
    milestoneId?: number;
    constructor(initParamObject: any) {
        super({ _dbTableName: 'Tasks' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;

        this.deadline = ToolsDate.dateJsToSql(initParamObject.deadline);

        this.status = initParamObject.status;
        if (initParamObject._owner) {
            this.ownerId = initParamObject._owner.id;
            this._owner = initParamObject._owner;
            if (this._owner.id)
                this._owner._nameSurnameEmail = this._owner.name.trim() + ' ' + this._owner.surname.trim() + ': ' + this._owner.email.trim();
        }
        if (initParamObject._parent) {
            this.caseId = initParamObject._parent.id;
            this._parent = initParamObject._parent;
        }
    }
    /* Służy do dodowania zadań domyślnych dla procesów. Jest odpalana w addNewProcessInstancesForCaseInDb()
   *
   */
    async addInDbFromTemplateForProcess(process: Process, conn: any, isPartOfTransaction: boolean) {
        const taskTemplate = (await TasksTemplateForProcesssController.getTasksTemplateForProcesssList({ processId: process.id }))[0];
        if (taskTemplate) {
            this.status = 'Backlog';
            this.name = taskTemplate.name;
            this.description = taskTemplate.description;

            return await this.addInDb(conn, isPartOfTransaction);
        }
    }

    async addInScrum(auth: OAuth2Client, externalConn?: mysql.PoolConnection, isPartOfBatch?: boolean) {
        const conn: mysql.PoolConnection = (externalConn) ? externalConn : await ToolsDb.pool.getConnection();
        if (await this.shouldBeInScrum(auth, conn)) {
            const parents = await this.getParents(conn);
            let currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;

            const contractOurIdColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.contractOurIdColName);
            //dla kontraktu 'Our' bierz dane z ourData, dla kontraktu na roboty bież dane z kolumny OurIdRelated
            const ourContractOurId = (parents.contractOurId) ? parents.contractOurId : parents.contractOurIdRelated;
            //const headerContractRow = <number>Tools.findFirstInRange(ourContractOurId, currentSprintValues, contractOurIdColIndex) + 1;
            const lastContractRow = <number>Tools.findLastInRange(ourContractOurId, currentSprintValues, contractOurIdColIndex) + 1;
            //const contractTasksRowsCount = lastContractRow - headerContractRow;
            //wstaw wiersz nowej sprawy
            await ToolsSheets.insertRows(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                sheetId: Setup.ScrumSheet.CurrentSprint.id,
                startIndex: lastContractRow,
                endIndex: lastContractRow + 1
            });

            this.scrumSheetRow = lastContractRow + 1
            //wyełnij danymi https://developers.google.com/sheets/api/samples/data#copy_and_paste_cell_formatting
            const timesColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.timesColName);
            await Promise.all([
                ToolsSheets.copyPasteRows(auth, {
                    source: {
                        sheetId: Setup.ScrumSheet.CurrentSprint.id,
                        startRowIndex: lastContractRow + 2,
                        endRowIndex: lastContractRow + 3,
                    },
                    destination: {
                        sheetId: Setup.ScrumSheet.CurrentSprint.id,
                        startRowIndex: lastContractRow,
                        endRowIndex: lastContractRow + 1,
                    },
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    pasteType: 'PASTE_FORMAT'
                }),
                ToolsSheets.copyPasteRows(auth, {
                    source: {
                        sheetId: Setup.ScrumSheet.CurrentSprint.id,
                        startRowIndex: lastContractRow + 2,
                        endRowIndex: lastContractRow + 3,
                        startColumnIndex: timesColIndex,
                        endColumnIndex: timesColIndex + 20
                    },
                    destination: {
                        sheetId: Setup.ScrumSheet.CurrentSprint.id,
                        startRowIndex: lastContractRow,
                        endRowIndex: lastContractRow + 1,
                        startColumnIndex: timesColIndex
                    },
                    spreadsheetId: Setup.ScrumSheet.GdId,
                })
            ]);
            const milestoneGdFolderUrl = ToolsGd.createGdFolderUrl(parents.milestoneGdFolderId);
            const milestoneNameCaption = (parents.milestoneName) ? ` | ${parents.milestoneName}` : '';
            let milestoneLabel = `=HYPERLINK("${milestoneGdFolderUrl}";"${parents.milestoneTypeFolderNumber} ${parents.milestoneTypeName}${milestoneNameCaption}")`;

            const parentCase = new Case({ number: parents.caseNumber, _type: {} })
            const parentCaseDisplayNumber = (parentCase.number) ? ' | ' + parentCase._displayNumber : '';
            let contract_Number_Alias = parents.contractNumber
            contract_Number_Alias += (parents.contractAlias) ? ' ' + parents.contractAlias : '';

            const parentsData = [
                [
                    parents.projectId,
                    parents.contractId,
                    (parents.contractOurId) ? parents.contractOurId : parents.contractOurIdRelated, //dla kontrakty our bież dane z ourData, dla kontraktu na roboty bież dane z kolimny OurIdRelated
                    parents.milestoneId,
                    parents.caseTypeId,
                    this.caseId,
                    this.id,
                    (this.ownerId) ? this.ownerId : '',
                    '{"caseSynchronized":true,"taskSynchronized":true}',
                    (!parents.contractOurId) ? contract_Number_Alias : ' ',
                    milestoneLabel,
                    parents.caseTypeFolderNumber + ' ' + parents.caseTypeName + parentCaseDisplayNumber,
                    parents.caseName,
                    this.name,
                    (this.deadline) ? this.deadline : '',
                    '',
                    this.status,
                    (this.ownerId) ? this._owner.name + ' ' + this._owner.surname : ''
                ]
            ];
            const projectIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.projectIdColName) + 1;
            await ToolsSheets.updateValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: `${Setup.ScrumSheet.CurrentSprint.name}!${ToolsSheets.R1C1toA1(lastContractRow + 1, projectIdColNumber)}`,
                values: parentsData
            });

            await ScrumSheet.CurrentSprint.setSprintSumsInRows(auth, lastContractRow + 1);

            if (!isPartOfBatch) {
                //odtwórz #Times (ostatnie kolumny arkusza)
                await ScrumSheet.CurrentSprint.setSumInContractRow(auth, ourContractOurId);
                await ScrumSheet.CurrentSprint.sortContract(auth, ourContractOurId);
                if (lastContractRow < 13)
                    await ScrumSheet.CurrentSprint.makeTimesSummary(auth);
            }
            return lastContractRow;
        }
        else {
            console.log('Nie dodaję do Scruma');
        }
    }

    private async getParents(conn: mysql.PoolConnection) {
        const sql = `SELECT
            Cases.Name AS CaseName,
            Cases.TypeId AS CaseTypeId,
            Cases.Number AS CaseNumber,
            CaseTypes.Name AS CaseTypeName,
            CaseTypes.FolderNumber AS CaseTypeFolderNumber,
            Milestones.Id AS MilestoneId,
            Milestones.Name AS MilestoneName,
            Milestones.GdFolderId AS MilestoneGdFolderId,
            MilestoneTypes.Name AS MilestoneTypeName,
            MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber,
            ParentContracts.Id AS ParentContractId,
            OurContractsData.OurId AS OurContractsDataOurId,
            ParentContracts.OurIdRelated AS ParentContractOurIdRelated,
            ParentContracts.Number AS ParentContractNumber,
            ParentContracts.Alias AS ParentContractAlias,
            ParentContracts.ProjectOurId
            FROM Cases
            LEFT JOIN CaseTypes ON CaseTypes.Id=Cases.TypeId
            JOIN Milestones ON Milestones.Id=Cases.MilestoneId
            LEFT JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
            JOIN Contracts AS ParentContracts ON Milestones.ContractId = ParentContracts.Id
            LEFT JOIN OurContractsData ON Milestones.ContractId = OurContractsData.Id
            JOIN ContractTypes ON ContractTypes.Id = ParentContracts.TypeId
            JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.ContractTypeId=ContractTypes.Id AND MilestoneTypes_ContractTypes.MilestoneTypeId=MilestoneTypes.Id
            WHERE Cases.Id =${this.caseId}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        try {
            var row = result[0];
            return {
                caseName: <string>row.CaseName,
                caseTypeId: <number>row.CaseTypeId,
                caseNumber: <string>row.CaseNumber,
                caseTypeName: <string>row.CaseTypeName,
                caseTypeFolderNumber: <string>row.CaseTypeFolderNumber,
                milestoneId: <number>row.MilestoneId,
                milestoneName: <string>row.MilestoneName,
                milestoneTypeName: <string>row.MilestoneTypeName,
                milestoneTypeFolderNumber: <string>row.MilestoneTypeFolderNumber,
                milestoneGdFolderId: <string>row.MilestoneGdFolderId,
                contractId: <number>row.ParentContractId,
                contractOurId: <string>row.OurContractsDataOurId, //dla ourContracts
                contractOurIdRelated: <string>row.ParentContractOurIdRelated, //dla kontraktów na roboty
                contractNumber: <string>row.ParentContractNumber,
                contractAlias: <string>row.ParentContractAlias,
                projectId: <string>row.ProjectOurId
            }
        } catch (err) {
            throw err;
        }
    }

    async editInScrum(auth: OAuth2Client) {
        let currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.CurrentSprint.name
        })).values;
        const taskNameColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskNameColName) + 1;
        const taskIdColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskIdColName);
        const taskDataRow = <number>Tools.findFirstInRange(<number>this.id, currentSprintValues, taskIdColIndex) + 1;
        if (taskDataRow) {
            if (await this.shouldBeInScrum(auth)) {
                const taskData = [[
                    this.name,
                    (this.deadline) ? this.deadline : '',
                    '',
                    this.status,
                    (this._owner && this._owner.id) ? this._owner.name + ' ' + this._owner.surname : ''
                ]];
                await ToolsSheets.updateValues(auth, {
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    rangeA1: `${Setup.ScrumSheet.CurrentSprint.name}!${ToolsSheets.R1C1toA1(taskDataRow, taskNameColNumber)}`,
                    values: taskData
                });
            }
            else
                await this.deleteFromScrum(auth);
        }
        else { //zmieniono status z 'Backlog' albo przypisano do pracownika ENVI
            await this.addInScrum(auth);
        }
    }

    async deleteFromScrum(auth: OAuth2Client) {
        ScrumSheet.CurrentSprint.deleteRowsByColValue(auth, {
            searchColName: Setup.ScrumSheet.CurrentSprint.taskIdColName,
            valueToFind: <number>this.id
        });
    }

    /**
     * sprawdza czy zadanie powinno znaleźć się w arkuszu SCRUM
     * @param externalConn 
     * @returns 
     */
    async shouldBeInScrum(auth: OAuth2Client, externalConn?: mysql.PoolConnection) {
        let test = false;
        if (this._owner && this._owner.id) {
            let owner = new Person(this._owner);
            test = this.status !== 'Backlog' && (await owner.getSystemRole()).systemRoleId <= 3
        }
        else
            test = this.status !== 'Backlog';
        //zadanie nie powinno być w scrumie jeśli nie ma w scrumie kontraktu
        if (test) {
            const conn = (externalConn) ? externalConn : await ToolsDb.pool.getConnection();
            const parents = await this.getParents(conn);
            let currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;

            const contractOurIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.contractOurIdColName);
            //dla kontraktu 'Our' bierz dane z ourData, dla kontraktu na roboty bież dane z kolumny OurIdRelated
            const ourContractOurId = (parents.contractOurId) ? parents.contractOurId : parents.contractOurIdRelated;
            const headerContractRow = <number>Tools.findFirstInRange(ourContractOurId, currentSprintValues, contractOurIdColNumber);
            if (!headerContractRow)
                test = false;
        }
        return test;
    }
}

