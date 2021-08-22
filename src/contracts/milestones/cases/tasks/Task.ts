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
    async addInDbFromTemplate(process: Process, conn: any, isPartOfTransaction: boolean) {
        const taskTemplate = (await TasksTemplateForProcesssController.getTasksTemplateForProcesssList({ processId: process.id }))[0];
        if (taskTemplate) {
            this.status = 'Backlog';
            this.name = taskTemplate.name;
            this.description = taskTemplate.description;

            return await this.addInDb(conn, isPartOfTransaction);
        }
    }

    async addInScrum(auth: OAuth2Client, externalConn?: mysql.PoolConnection, skipMakeTimesSummary?: boolean) {
        const conn: mysql.PoolConnection = (externalConn) ? externalConn : await ToolsDb.pool.getConnection();
        if (await this.shouldBeInScrum(auth, conn)) {

            const parents = await this.getParents(conn);
            let currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;

            const contractOurIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.contractOurIdColName);
            //dla kontraktu 'Our' bierz dane z ourData, dla kontraktu na roboty bież dane z kolumny OurIdRelated
            const ourContractOurId = (parents.contractOurId) ? parents.contractOurId : parents.contractOurIdRelated;
            const headerContractRow = <number>Tools.findFirstInRange(ourContractOurId, currentSprintValues, contractOurIdColNumber) + 1;
            const lastContractRow = <number>Tools.findLastInRange(ourContractOurId, currentSprintValues, contractOurIdColNumber) + 1;
            const contractTasksRowsCount = lastContractRow - headerContractRow;
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
                        startRowIndex: lastContractRow + 0,
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
                        startRowIndex: lastContractRow + 0,
                        endRowIndex: lastContractRow + 1,
                        startColumnIndex: timesColIndex
                    },
                    spreadsheetId: Setup.ScrumSheet.GdId,
                })
            ]);

            let milestoneNameLabel = parents.milestoneTypeFolderNumber + ' ' + parents.milestoneTypeName;
            if (parents.milestoneName)
                milestoneNameLabel += ' | ' + parents.milestoneName;

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
                    milestoneNameLabel,
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

            //var timesRange = SCRUM_SHEET.getRange(lastContractRow + 2, SCRUM_COL_TIMES + 1, 1, SCRUM_SHEET.getLastColumn() - SCRUM_COL_TIMES + 1);
            //var timesRangeFormulas = timesRange.getFormulas();
            await ScrumSheet.CurrentSprint.setSprintSumsInRows(auth, lastContractRow + 1);

            //odtwórz #Times (ostatnie kolumny arkusza)
            await ScrumSheet.CurrentSprint.setSumInContractRow(auth, headerContractRow, contractTasksRowsCount + 1);
            //timesRange.setFormulas(timesRangeFormulas);
            //odtwórz #TimesSummary
            await ScrumSheet.CurrentSprint.sortContract(auth, ourContractOurId);
            if (lastContractRow < 13 && !skipMakeTimesSummary)
                ScrumSheet.CurrentSprint.makeTimesSummary(auth);

            return {
                lastContractRow: lastContractRow
            };
        }
        else
            console.log('Nie dodaję do Scruma');
    }

    async getParents(conn: mysql.PoolConnection) {
        const sql = 'SELECT \n \t' +
            'Cases.Name AS CaseName, \n \t' +
            'Cases.TypeId AS CaseTypeId, \n \t' +
            'Cases.Number AS CaseNumber, \n \t' +
            'CaseTypes.Name AS CaseTypeName, \n \t' +
            'CaseTypes.FolderNumber AS CaseTypeFolderNumber, \n \t' +
            'Milestones.Id AS MilestoneId, \n \t' +
            'Milestones.Name AS MilestoneName, \n \t' +
            'MilestoneTypes.Name AS MilestoneTypeName, \n \t' +
            'MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber, \n \t' +
            'ParentContracts.Id AS ParentContractId, \n \t' +
            //OurContractsData może dotyczyć _parenta lub kontraktu powiązanego z kontraktem parentem - kolumna 'OurIdRelated'
            'OurContractsData.OurId AS OurContractsDataOurId, \n \t' +
            'ParentContracts.OurIdRelated AS ParentContractOurIdRelated, \n \t' +
            'ParentContracts.Number AS ParentContractNumber, \n \t' +
            'ParentContracts.Alias AS ParentContractAlias, \n \t' +
            'ParentContracts.ProjectOurId \n' +
            'FROM Cases \n' +
            'LEFT JOIN CaseTypes ON CaseTypes.Id=Cases.TypeId \n' +
            'JOIN Milestones ON Milestones.Id=Cases.MilestoneId \n' +
            'LEFT JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id \n' +
            'JOIN Contracts AS ParentContracts ON Milestones.ContractId = ParentContracts.Id \n' +
            'LEFT JOIN OurContractsData ON Milestones.ContractId = OurContractsData.Id \n' +
            'JOIN ContractTypes ON ContractTypes.Id = ParentContracts.TypeId \n' +
            'JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.ContractTypeId=ContractTypes.Id AND MilestoneTypes_ContractTypes.MilestoneTypeId=MilestoneTypes.Id \n' +
            'WHERE Cases.Id =' + this.caseId + '';

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
        const taskDataRow = <number>Tools.findFirstInRange(<number>this.id, currentSprintValues, taskNameColNumber) + 1;
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
            this.addInScrum(auth);
        }
    }


    async deleteFromScrum(auth: OAuth2Client) {
        let currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.CurrentSprint.name
        })).values;
        const taskIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.taskIdColName);
        //usuń wiersz bazy w arkuszu Data
        const taskDataRow = <number>Tools.findFirstInRange(<number>this.id, currentSprintValues, taskIdColNumber);
        if (taskDataRow) {
            await ToolsSheets.deleteRows(auth, { spreadsheetId: Setup.ScrumSheet.GdId, sheetId: Setup.ScrumSheet.CurrentSprint.id, startIndex: taskDataRow, endIndex: taskDataRow + 1 });
        }
        if (taskDataRow < 13) {
            //odtwórz #TimesSummary i #Times
            ScrumSheet.CurrentSprint.makeTimesSummary(auth);
        }
    }

    /**
     * sprawdza czy zadanie powinno znaleźć się w arkuszu SCRUM
     * @param externalConn 
     * @returns 
     */
    async shouldBeInScrum(auth: OAuth2Client, externalConn?: mysql.PoolConnection) {
        var test = false;
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

