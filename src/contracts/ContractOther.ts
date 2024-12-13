import ToolsGd from '../tools/ToolsGd';
import { OAuth2Client } from 'google-auth-library';
import mysql from 'mysql2/promise';
import Contract from './Contract';
import ContractOur from './ContractOur';
import Setup from '../setup/Setup';
import ScrumSheet from '../ScrumSheet/ScrumSheet';
import ToolsSheets from '../tools/ToolsSheets';
import Tools from '../tools/Tools';
import ToolsDb from '../tools/ToolsDb';
import { drive_v3 } from 'googleapis';
import { OtherContractData } from '../types/types';
import Entity from '../entities/Entity';

export default class ContractOther
    extends Contract
    implements OtherContractData
{
    _ourContract?: ContractOur;
    ourIdRelated?: string;
    materialCardsGdFolderId?: string;
    _contractors?: Entity[] | undefined;

    constructor(initParamObject: any, conn?: mysql.PoolConnection) {
        super(initParamObject);
        //kontrakt na roboty może być obsługiwany przez ourContract
        if (
            initParamObject._ourContract &&
            initParamObject._ourContract.ourId
        ) {
            this._ourContract = <ContractOur>initParamObject._ourContract;
            this._ourContract.ourId =
                initParamObject._ourContract.ourId.toUpperCase();
            this._ourContract._ourType = this.getType(
                initParamObject._ourContract.ourId
            );
            this._ourContract._gdFolderUrl = ToolsGd.createGdFolderUrl(
                initParamObject._ourContract.gdFolderId
            );
            if (initParamObject._ourContract.name)
                this._ourContract._ourIdOrNumber_Name =
                    initParamObject._ourContract.ourId +
                    ' ' +
                    initParamObject._ourContract.name.substr(0, 50) +
                    '...';
            this.ourIdRelated = initParamObject._ourContract.ourId;
        }
        //znacznik uniwersalny gdy chemy wybierać ze wszystkich kontraktów Our i Works
        let _ourIdOrNumber = this.number;
        this.materialCardsGdFolderId = initParamObject.materialCardsGdFolderId;
        this._ourIdOrNumber_Name = `${_ourIdOrNumber} ${this.name?.substring(
            0,
            50
        )} ...`;
        this._ourIdOrNumber_Alias = _ourIdOrNumber;
        if (this.alias) this._ourIdOrNumber_Alias += ' ' + this.alias;
        this.setFolderName();
    }

    async addInDb() {
        return await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await super.addInDb(conn, true);
            await this.addEntitiesAssociationsInDb(conn, true);
            await this.addContractRangesAssociationsInDb(conn, true);
        });
    }

    async editInDb(
        extenalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
        _fieldsToUpdate?: string[]
    ) {
        const res = await ToolsDb.transaction(async (conn) => {
            await super.editInDb(conn, true, _fieldsToUpdate);
            await this.editEntitiesAssociationsInDb(conn, true);
            await this.editContractRangesAssociationsInDb(conn, true);
        });
    }

    setFolderName() {
        this._folderName = `${this.number} ${this.alias || ''}`.trim();
    }

    getType(ourId: string): string {
        return ourId.substring(ourId.indexOf('.') + 1, ourId.lastIndexOf('.'));
    }

    setEntitiesFromParent() {
        super.setEntitiesFromParent();
        if (this._engineers?.length == 0)
            this._engineers = this._project._engineers;
    }
    async setContractRootFolder(
        auth: OAuth2Client
    ): Promise<drive_v3.Schema$File> {
        if (!this._folderName) throw new Error('Folder name not set');
        if (!this._ourContract) return super.setContractRootFolder(auth);
        return await ToolsGd.setFolder(auth, {
            parentId: <string>this._ourContract?.gdFolderId,
            name: this._folderName,
        });
    }

    async createFolders(auth: OAuth2Client) {
        await super.createFolders(auth);
        const materialCardsFolder = await ToolsGd.setFolder(auth, {
            parentId: <string>this.gdFolderId,
            name: 'Wnioski Materiałowe',
        });
        this.materialCardsGdFolderId = <string>materialCardsFolder.id;
    }

    async shouldBeInScrum() {
        if (this.ourIdRelated) return this.status !== 'Archiwalny';
        else return false;
    }
    /** nic nie robi - nie dodajemy nagłówka dla OtherContract */
    async addInScrum(auth: OAuth2Client) {}

    async editInScrum(auth: OAuth2Client) {
        if (!(await this.shouldBeInScrum())) {
            this.deleteFromScrum(auth).then(() => {
                console.log('ContractOther deleted From Scrum');
            });
            return;
        }

        const currentSprintValues = <any[][]>(
            await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name,
            })
        ).values;
        const contractIdColIndex = currentSprintValues[0].indexOf(
            Setup.ScrumSheet.CurrentSprint.contractDbIdColName
        );

        let firstRowNumber =
            <number>(
                Tools.findFirstInRange(
                    <number>this.id,
                    currentSprintValues,
                    contractIdColIndex
                )
            ) + 1;
        if (firstRowNumber) {
            await ScrumSheet.CurrentSprint.editRowsByColValue(auth, {
                searchColName:
                    Setup.ScrumSheet.CurrentSprint.contractDbIdColName,
                valueToFind: <number>this.id,
                firstColumnName:
                    Setup.ScrumSheet.CurrentSprint.contractNumberColName,
                rowValues: [<string>this._ourIdOrNumber_Alias],
                //majorDimension: 'COLUMNS'
            });
            console.log('ContractOther edited In Scrum');
        } else {
            console.log('ContractOther not found in Scrum - adding tasks');
            await this.addExistingTasksInScrum(auth);
            //sprawdź czy jest macierzysta umowa ENVI dodana do Scruma
            const contractOurIdColIndex = currentSprintValues[0].indexOf(
                Setup.ScrumSheet.CurrentSprint.contractOurIdColName
            );
            firstRowNumber =
                <number>(
                    Tools.findFirstInRange(
                        <string>this.ourIdRelated,
                        currentSprintValues,
                        contractOurIdColIndex
                    )
                ) + 1;

            await ScrumSheet.CurrentSprint.setSumInContractRow(
                auth,
                <string>this.ourIdRelated
            );
            await ScrumSheet.CurrentSprint.sortContract(
                auth,
                <string>this.ourIdRelated
            );
            if (firstRowNumber < 13) {
                await ScrumSheet.CurrentSprint.makeTimesSummary(auth);
                await ScrumSheet.CurrentSprint.makePersonTimePerTaskFormulas(
                    auth
                );
            }
        }
    }

    async deleteFromScrum(auth: OAuth2Client) {
        ScrumSheet.CurrentSprint.deleteRowsByColValue(auth, {
            searchColName: Setup.ScrumSheet.CurrentSprint.contractDbIdColName,
            valueToFind: <number>this.id,
        });
    }

    async createDefaultMilestones(auth: OAuth2Client) {
        if (this.ourIdRelated) {
            super.createDefaultMilestones(auth);
            await ScrumSheet.CurrentSprint.setSumInContractRow(
                auth,
                this.ourIdRelated
            );
            await ScrumSheet.CurrentSprint.sortContract(
                auth,
                this.ourIdRelated
            );

            await ScrumSheet.CurrentSprint.makeTimesSummary(auth);
            await ScrumSheet.CurrentSprint.makePersonTimePerTaskFormulas(auth);
        } else throw new Error('Kontrakt nie został przypisany do umowy ENVI');
    }

    /**
     * @returns true jeśli kontrakt ma unikalny numer w ramach projektu
     */
    async isUniquePerProject(): Promise<boolean> {
        const sql = `SELECT Id FROM Contracts WHERE 
            Number = '${this.number}' AND ProjectOurId = "${this.projectOurId}"`;

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            return result[0] ? true : false;
        } catch (err) {
            throw err;
        }
    }
    protected makeNotUniqueErrorMessage(): string {
        return (
            `Kontrakt o numerze ${this.number} już istnieje w projekcie ${this.projectOurId} \n` +
            `Wprowadź inny numer kontraktu`
        );
    }
}
