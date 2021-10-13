import ToolsGd from '../tools/ToolsGd';
import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import Contract from './Contract';
import ContractOur from './ContractOur';
import { google } from 'googleapis';
import Setup from '../setup/Setup';
import ScrumSheet from '../ScrumSheet/ScrumSheet';

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
        if (this.name) {
            this._ourIdOrNumber_Name = `${_ourIdOrNumber} ${this.name.substr(0, 50)} ...`
        }
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
        super.createFolders(auth);
        const materialCardsFolder = await ToolsGd.setFolder(auth, { parentId: <string>this._parent.gdFolderId, name: 'Wnioski Materiałowe' });
        this.materialCardsGdFolderId = materialCardsFolder.id;
    }

    /** nic nie robi */
    addInScrum(auth: OAuth2Client) {

    }

    editInScrum(auth: OAuth2Client): void {
        ScrumSheet.CurrentSprint.editRowsByColValue(auth, {
            searchColName: Setup.ScrumSheet.CurrentSprint.contractDbIdColName,
            valueToFind: <number>this.id,
            firstColumnName: Setup.ScrumSheet.CurrentSprint.contractNumberColName,
            values: [[<string>this._ourIdOrNumber_Alias]],
            //majorDimension: 'COLUMNS'
        })
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
}