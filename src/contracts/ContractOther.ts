import ToolsGd from '../tools/ToolsGd';
import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import Contract from './Contract';
import ContractOur from './ContractOur';
import { google } from 'googleapis';
import Setup from '../setup/Setup';
import ScrumSheet from '../ScrumSheet/ScrumSheet';
import ToolsSheets from '../tools/ToolsSheets';
import Tools from '../tools/Tools';
import ToolsDb from '../tools/ToolsDb';

export default class ContractOther extends Contract {
    _ourContract?: ContractOur;
    ourIdRelated?: string;
    materialCardsGdFolderId: string | undefined;

    constructor(initParamObject: any, conn?: mysql.PoolConnection) {
        super(initParamObject);
        //kontrakt na roboty może być obsługiwany przez ourContract
        if (initParamObject._ourContract && initParamObject._ourContract.ourId) {
            this._ourContract = <ContractOur>initParamObject._ourContract;
            this._ourContract.ourId = initParamObject._ourContract.ourId.toUpperCase();
            this._ourContract._ourType = this.getType(initParamObject._ourContract.ourId);
            this._ourContract._gdFolderUrl = ToolsGd.createGdFolderUrl(initParamObject._ourContract.gdFolderId);
            if (initParamObject._ourContract.name)
                this._ourContract._ourIdOrNumber_Name = initParamObject._ourContract.ourId + ' ' + initParamObject._ourContract.name.substr(0, 50) + '...';
            this.ourIdRelated = initParamObject._ourContract.ourId;
        }
        //znacznik uniwersalny gdy chemy wybierać ze wszystkich kontraktów Our i Works
        let _ourIdOrNumber = this.number;
        this.materialCardsGdFolderId = initParamObject.materialCardsGdFolderId;
        this._ourIdOrNumber_Name = `${_ourIdOrNumber} ${this.name?.substring(0, 50)} ...`
        this._ourIdOrNumber_Alias = _ourIdOrNumber;
        if (this.alias)
            this._ourIdOrNumber_Alias += ' ' + this.alias;
        this.setFolderName();
    }

    setFolderName() {
        this._folderName = `${this.number} ${this.alias || ''}`.trim();
    }

    getType(ourId: string): string {
        return ourId.substring(ourId.indexOf('.') + 1, ourId.lastIndexOf('.'));
    }

    setEntitiesFromParent() {
        super.setEntitiesFromParent();
        if (this._engineers.length == 0)
            this._engineers = this._parent._engineers;
    }

    async createFolders(auth: OAuth2Client) {
        await super.createFolders(auth);
        const materialCardsFolder = await ToolsGd.setFolder(auth, { parentId: <string>this.gdFolderId, name: 'Wnioski Materiałowe' });
        this.materialCardsGdFolderId = <string>materialCardsFolder.id;
    }

    async shouldBeInScrum() {
        if (this.ourIdRelated)
            return this.status !== 'Archiwalny'
        else
            return false;
    }
    /** nic nie robi */
    addInScrum(auth: OAuth2Client) {

    }

    async editInScrum(auth: OAuth2Client) {
        if (await this.shouldBeInScrum()) {
            const currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;
            const contractIdColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.contractDbIdColName);
            let firstRowNumber = <number>Tools.findFirstInRange(<number>this.id, currentSprintValues, contractIdColIndex) + 1;
            if (firstRowNumber) {
                ScrumSheet.CurrentSprint.editRowsByColValue(auth, {
                    searchColName: Setup.ScrumSheet.CurrentSprint.contractDbIdColName,
                    valueToFind: <number>this.id,
                    firstColumnName: Setup.ScrumSheet.CurrentSprint.contractNumberColName,
                    rowValues: [<string>this._ourIdOrNumber_Alias],
                    //majorDimension: 'COLUMNS'
                });
            }
            else {
                await this.addTasksInScrum(auth);
                //sprawdź czy jest macierzysta umowa ENVI dodana do Scruma
                const contractOurIdColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.contractOurIdColName);
                firstRowNumber = <number>Tools.findFirstInRange(<string>this.ourIdRelated, currentSprintValues, contractOurIdColIndex) + 1;

                await ScrumSheet.CurrentSprint.setSumInContractRow(auth, <string>this.ourIdRelated);
                await ScrumSheet.CurrentSprint.sortContract(auth, <string>this.ourIdRelated);
                if (firstRowNumber < 13) {
                    await ScrumSheet.CurrentSprint.makeTimesSummary(auth);
                    await ScrumSheet.CurrentSprint.makePersonTimePerTaskFormulas(auth);
                }
            }
        } else
            this.deleteFromScrum(auth);

    }

    async deleteFromScrum(auth: OAuth2Client) {
        ScrumSheet.CurrentSprint.deleteRowsByColValue(auth, {
            searchColName: Setup.ScrumSheet.CurrentSprint.contractDbIdColName,
            valueToFind: <number>this.id
        });
    }

    async createDefaultMilestones(auth: OAuth2Client) {
        if (this.ourIdRelated) {
            super.createDefaultMilestones(auth);
            await ScrumSheet.CurrentSprint.setSumInContractRow(auth, this.ourIdRelated);
            await ScrumSheet.CurrentSprint.sortContract(auth, this.ourIdRelated);

            await ScrumSheet.CurrentSprint.makeTimesSummary(auth);
            await ScrumSheet.CurrentSprint.makePersonTimePerTaskFormulas(auth);
        } else
            throw new Error('Kontrakt nie został przypisany do umowy ENVI');
    }

    async isUnique(): Promise<boolean> {
        const sql = `SELECT Id FROM Contracts WHERE 
            Number = '${this.number}' AND ProjectOurId = "${this.projectOurId}"`;

        try {
            const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
            return (result[0]) ? true : false

        } catch (err) {
            throw err;
        }
    }
}