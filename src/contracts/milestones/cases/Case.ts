import { drive_v3, google } from 'googleapis';
import BusinessObject from '../../../BussinesObject';
import { OAuth2Client } from 'google-auth-library';
import Task from './tasks/Task';
import ToolsGd from '../../../tools/ToolsGd';
import ToolsDb from '../../../tools/ToolsDb';
import Setup from '../../../setup/Setup';
import ToolsSheets from '../../../tools/ToolsSheets';
import Tools from '../../../tools/Tools';
import ProcessInstance from '../../../processes/processInstances/ProcessInstance';
import mysql from 'mysql2/promise';

export default class Case extends BusinessObject {
    id?: number;
    number?: number;
    _wasChangedToUniquePerMilestone?: boolean;
    name?: string | null;
    description?: string;
    _type?: any;
    typeId?: number;
    _typeFolderNumber_TypeName_Number_Name?: string;
    _displayNumber?: string;
    milestoneId?: number;
    _parent?: any;
    _risk: any;
    _processesInstances?: any[];
    gdFolderId?: string;
    _gdFolderUrl?: string;
    _folderName?: string;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'Cases' });
        this.id = initParamObject.id;
        this.number = initParamObject.number;
        if (initParamObject._type.isUniquePerMilestone && this.number) this._wasChangedToUniquePerMilestone = true;

        this.name = (initParamObject.name !== '') ? initParamObject.name : undefined;
        if (initParamObject.description !== undefined) // musi być sprawdzenie undefined, żeby obsłużyć pusty ciąg
            this.description = initParamObject.description;
        if (initParamObject._type) {
            this._type = initParamObject._type;
            if (initParamObject._type.id)
                this.typeId = initParamObject._type.id;

            this.setDisplayNumber(); //ustawia też this._folderName - uruchamia this.setGdFolderName();
            this._typeFolderNumber_TypeName_Number_Name = this._type.folderNumber + ' ' + this._type.name;
            if (!this._type.isUniquePerMilestone)
                this._typeFolderNumber_TypeName_Number_Name += ' | ' + this._displayNumber + ' ' + this.name;
        }
        if (initParamObject.gdFolderId) {
            this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
        }
        if (initParamObject._parent) {
            this.milestoneId = initParamObject._parent.id;
            this._parent = initParamObject._parent;
        }
        this._risk = initParamObject._risk;
        this._processesInstances = (initParamObject._processesInstances) ? initParamObject._processesInstances : [];
    }


    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }
    setAsUniquePerMilestone() {
        this.number = undefined;
        this.name = null;
    }
    //ustawia numer do wyświetlenia w sytemie na podstawie danych z bazy
    setDisplayNumber() {
        var _displayNumber;
        if (!this.number)
            _displayNumber = '00'
        else if (this.number < 10)
            _displayNumber = '0' + this.number
        else
            _displayNumber = this.number;
        _displayNumber = 'S' + _displayNumber;
        this._displayNumber = _displayNumber;
        this.gdFolderName();
    }

    gdFolderName() {
        const caseName = (this.name) ? ' ' + this.name : '';
        this._folderName = this._displayNumber + caseName;

        if (this._wasChangedToUniquePerMilestone)
            this._folderName += ' - przenieś pliki i usuń folder'
        else if (this._type.isUniquePerMilestone)
            this._folderName = this._type.folderNumber + ' ' + this._type.name;
    }

    /*
     * jest wywoływana w addNewCase()
     * tworzy instancję procesu i zadanie do scrumboarda na podstawie szablonu
     */
    async addNewProcessInstancesInDb(externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        if (this._type._processes.length > 0) {
            //typ sprawy może mieć wiele procesów - sprawa automatycznie też
            let item;
            for (const process of this._type._processes) {
                //dodaj zadanie ramowe z szablonu
                let processInstanceTask = new Task({ _parent: this });
                await processInstanceTask.addInDbFromTemplate(process, externalConn, true);

                item = new ProcessInstance({
                    _process: process,
                    _case: this,
                    _task: processInstanceTask
                });
                await item.addInDb(externalConn, isPartOfTransaction);
            }
            return item;
        }
    }
    /*
     * jest wywoływana w editCase()
     * kasuje Instancje procesu i zadanie ramowe, potem tworzy je nanowo dla nowego typu sprawy
     */
    async editProcessInstancesInDb(externalConn?: mysql.PoolConnection, isPartOfTransaction?: boolean) {
        await this.deleteProcessInstancesFromDb();
        await this.addNewProcessInstancesInDb(externalConn, isPartOfTransaction);
    }

    async deleteProcessInstancesFromDb() {
        const sql = `DELETE FROM ProcessInstances WHERE CaseId =?`;
        return await ToolsDb.executePreparedStmt(sql, [this.id], this);
    }
    /**
     * Tworzy folder sprawy. 
     * Jeżeli typ sprawy jest unikatowy nie powstaje jej podfolder -pliki są bezpośrednio w folderze typu sprawy w danym kamieniu milowym  
     */
    async createCaseFolder(auth: OAuth2Client) {
        //znajdź (i jak trzeba utwórz) folder typu sprawy
        //const milestoneFolder = DriveApp.getFolderById(this._parent.gdFolderId);
        const parentFolder = await ToolsGd.setFolder(auth, { parentId: this._parent.gdFolderId, name: this._type.folderNumber + ' ' + this._type.name })
        let caseFolder = parentFolder;
        if (!this._type.isUniquePerMilestone) {
            caseFolder = await ToolsGd.setFolder(auth, { parentId: <string>parentFolder.id, name: `SXX ${this.name}` });
        }
        this.setGdFolderIdAndUrl(caseFolder?.id as string);
        return caseFolder;
    }

    async editCaseFolder(auth: OAuth2Client) {
        //sytuacja normalna - folder itnieje
        if (this.gdFolderId) {
            //sprawy uniqe nie mają swojego foldera - nie ma czego edytować, chyba, że zostały zmienione na unique
            if (this._wasChangedToUniquePerMilestone || !this._type.isUniquePerMilestone) {
                return await ToolsGd.updateFolder(auth, { name: this._folderName, id: this.gdFolderId });
            }
        }
        //kamień nie miał wcześniej typu albo coś poszło nie tak przy tworzeniu folderu
        else {
            const caseFolder = await this.createCaseFolder(auth);
            this.setGdFolderIdAndUrl(caseFolder.id as string);
            return caseFolder;
        }
    }

    async deleteCaseFolder(auth: OAuth2Client) {
        //sprawy uniqe nie mają swojego foldera - nie ma czego kasować
        if (!this._type.isUniquePerMilestone && this.gdFolderId) {
            const drive = google.drive({ version: 'v3', auth });
            const filesSchema = await drive.files.get({ fileId: this.gdFolderId, fields: 'id, ownedByMe', });
            console.log(filesSchema.data)
            if (filesSchema.data.ownedByMe)
                await ToolsGd.trashFile(auth, filesSchema.data.id as string);
            else
                await ToolsGd.updateFolder(auth, { id: this.gdFolderId, name: `${this._folderName} - USUŃ` });
        }
    }

    async getNumberFromDb() {
        const sql = `SELECT Cases.Number FROM Cases WHERE Cases.Id=${this.id}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        try {
            var row = result[0];
            return <number>row.Number;
        } catch (err) {
            throw err;
        }
    }

    async addInDb() {
        const conn: mysql.PoolConnection = await ToolsDb.pool.getConnection();
        await conn.beginTransaction();
        let caseItem = await super.addInDb(conn, true);
        await this.addNewProcessInstancesInDb(conn, true);
        await conn.commit();
        this.number = await this.getNumberFromDb();
        this.setDisplayNumber();
        return caseItem;
    }

    async editInDb() {
        const conn: mysql.PoolConnection = await ToolsDb.pool.getConnection();
        await conn.beginTransaction();

        const res = await Promise.all([
            super.editInDb(conn, true),
            this.editProcessInstancesInDb(conn, true)
        ]);
        await conn.commit();
        return res[0];
    }
    /**
     * Dodaje sprawę do arkusza danych
     */
    async addInScrum(auth: OAuth2Client) {

        const caseData = [
            this.id,
            this.typeId,
            this.milestoneId,
            this.makenameCaption(),
            (this.gdFolderId) ? this.gdFolderId : ''
        ];
        let scrumDataValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.Data.name
        })).values;
        if (!Tools.findFirstInRange('' + this.id, scrumDataValues, scrumDataValues[0].indexOf(Setup.ScrumSheet.Data.caseIdColName)))
            ToolsSheets.appendRowsToSpreadSheet(auth, { spreadsheetId: Setup.ScrumSheet.GdId, sheetName: Setup.ScrumSheet.Data.name, values: [caseData] });
    }

    async editInScrum(auth: OAuth2Client) {
        await Promise.all([
            this.editInDataSheet(auth),
            this.editInScrumSheet(auth)
        ]);
    }

    private async editInDataSheet(auth: OAuth2Client) {
        let scrumDataValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.Data.name
        })).values;
        const caseIdColNumber = scrumDataValues[0].indexOf(Setup.ScrumSheet.Data.caseIdColName) + 1;
        const caseDataRow = <number>Tools.findFirstInRange(<number>this.id, scrumDataValues, caseIdColNumber - 1) + 1;
        const caseData = [
            this.id,
            this.typeId,
            this.milestoneId,
            this.makenameCaption(),
            (this.gdFolderId) ? this.gdFolderId : ''
        ];

        await ToolsSheets.updateValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: `${Setup.ScrumSheet.Data.name}!${ToolsSheets.R1C1toA1(caseDataRow, caseIdColNumber)}`,
            values: [caseData]
        });
        return caseIdColNumber;
    }

    private async editInScrumSheet(auth: OAuth2Client) {
        let currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.CurrentSprint.name
        })).values;
        const milestoneColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.milestoneIdColName);
        const caseTypeNameColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.caseTypeColName) + 1;
        const firstMilestoneRow = Tools.findFirstInRange(<number>this.milestoneId, currentSprintValues, milestoneColNumber);
        if (firstMilestoneRow) {
            const lastMilestoneRow = <number>Tools.findLastInRange(<number>this.milestoneId, currentSprintValues, milestoneColNumber);
            for (let i = firstMilestoneRow; i <= lastMilestoneRow; i++) {
                if (currentSprintValues[i][currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.caseIdColName)] == this.id) {
                    await ToolsSheets.updateValues(auth, {
                        spreadsheetId: Setup.ScrumSheet.GdId,
                        rangeA1: `${Setup.ScrumSheet.CurrentSprint.name}!${ToolsSheets.R1C1toA1(i + 1, caseTypeNameColNumber)}`,
                        values: [
                            [this._type.folderNumber + ' ' + this._type.name + ' | ' + this._displayNumber, this.makenameCaption()]
                        ]
                    });
                }
            }
        }
    }

    private makenameCaption() {
        let nameCaption;
        if (this.gdFolderId && this.name)
            nameCaption = `=HYPERLINK("${this._gdFolderUrl}";"${this.name}")`;
        else
            nameCaption = (this.name) ? this.name : ''
        return nameCaption;
    }

    async deleteFromScrumSheet(auth: OAuth2Client) {
        await Promise.all([
            this.deleteFromScrumboardSheet(auth),
            this.deleteFromDataSheet(auth)
        ]);
    }

    private async deleteFromDataSheet(auth: OAuth2Client) {
        let scrumDataValues = <any[][]>(await ToolsSheets.getValues(auth, {
            spreadsheetId: Setup.ScrumSheet.GdId,
            rangeA1: Setup.ScrumSheet.Data.name
        })).values;
        const caseIdColNumber = scrumDataValues[0].indexOf(Setup.ScrumSheet.Data.caseIdColName);
        //usuń wiersz bazy w arkuszu Data
        let caseDataRow = <number>Tools.findFirstInRange(<number>this.id, scrumDataValues, caseIdColNumber);
        if (caseDataRow) {
            await ToolsSheets.deleteRows(auth, { spreadsheetId: Setup.ScrumSheet.GdId, sheetId: Setup.ScrumSheet.Data.id, startIndex: caseDataRow, endIndex: caseDataRow + 1 });
        }
    }

    private async deleteFromScrumboardSheet(auth: OAuth2Client) {
        let firstMilestoneRow;
        do {
            let currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;
            const milestoneColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.milestoneIdColName);
            const scrumboardCaseIdColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.caseIdColName);

            firstMilestoneRow = Tools.findFirstInRange(<number>this.milestoneId, currentSprintValues, milestoneColIndex);
            let lastDeletedRow = 999999;
            if (firstMilestoneRow) {
                if (currentSprintValues[firstMilestoneRow][scrumboardCaseIdColIndex] == this.id) {
                    await ToolsSheets.deleteRows(auth, { spreadsheetId: Setup.ScrumSheet.GdId, sheetId: Setup.ScrumSheet.CurrentSprint.id, startIndex: firstMilestoneRow, endIndex: firstMilestoneRow + 1 });
                    lastDeletedRow = firstMilestoneRow + 1;
                }
            }
            //TODO: dorobić 
            if (lastDeletedRow < 13) {
                //var headerContractRow = findFirstInRange(ourContractOurId, SCRUM_DATA_VALUES, SCRUM_COL_CONTRACT_OUR_ID) + 1;
                //scrumMakeTimesSummary();
            }
        } while (firstMilestoneRow);
    }
}