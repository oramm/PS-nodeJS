
import mysql from 'mysql2/promise';
import Person from '../persons/Person';
import Contract from './Contract';
import Tools from '../tools/Tools';
import ToolsDb from '../tools/ToolsDb';
import { auth, OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import ToolsSheets from '../tools/ToolsSheets';
import Setup from '../setup/Setup';
import ScrumSheet from '../ScrumSheet/ScrumSheet';

export default class ContractOur extends Contract {
    ourId: string;
    managerId?: number;
    adminId?: number;
    _ourType: string;
    _manager?: Person;
    _admin?: Person;;

    constructor(initParamObject: any, conn?: mysql.PoolConnection) {
        super(initParamObject);
        if (initParamObject._ourContract && initParamObject._ourContract.ourId)
            throw new Error("Nie można powiązać ze sobą dwóch Umów ENVI!!!");
        console.log(initParamObject)
        this.ourId = initParamObject.ourId.toUpperCase();
        this._ourType = this.getType(this.ourId);
        if (initParamObject._manager) {
            this._manager = new Person(initParamObject._manager);
            this.managerId = initParamObject._manager.id
        };
        if (initParamObject._admin) {
            this._admin = new Person(initParamObject._admin);
            this.adminId = initParamObject._admin.id;
        }
        //znacznik uniwersalny gdy chemy wybierać ze wszystkich kontraktów Our i Works
        let ourIdOrNumber = this.ourId;

        if (this.name) {
            this._ourIdOrNumber_Name = `${ourIdOrNumber} ${this.name.substr(0, 50)} ...`;
        }
        this._ourIdOrNumber_Alias = `${ourIdOrNumber} ${this.alias || ''}`.trim();
        this.setFolderName();
    }

    setFolderName() {
        this._folderName = `${this.ourId} ${this.alias || ''}`.trim();
    }

    async addInDb() {
        let datatoDb = Tools.cloneOfObject(this);
        this.preparetoDboperation(datatoDb);
        await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            await ToolsDb.addInDb('Contracts', datatoDb, conn, true);
            this.id = datatoDb.id;
            await ToolsDb.addInDb('OurContractsData', this.getourContractDbFIelds(), conn, true);
        })
    }

    private getourContractDbFIelds() {
        return {
            _isIdNonIncrement: true,
            id: this.id,
            ourId: this.ourId,
            adminId: this.adminId,
            managerId: this.managerId
        };
    }

    private preparetoDboperation(datatoDb: any) {
        delete datatoDb.ourId;
        delete datatoDb.managerId;
        delete datatoDb.adminId;
    }

    async editInDb() {
        let datatoDb = Tools.cloneOfObject(this);
        this.preparetoDboperation(datatoDb);
        await ToolsDb.editInDb('Contracts', datatoDb);
        this.id = datatoDb.id;
        await ToolsDb.editInDb('OurContractsData', this.getourContractDbFIelds());
    }

    getType(ourId: string): string {
        return ourId.substring(ourId.indexOf('.') + 1, ourId.lastIndexOf('.'));
    }

    async shouldBeInScrum() {
        let test = false;
        if (this._admin && this._admin.email && this._admin.email.match(/urszula.juzwiak/i))
            return false;
        if (this.status !== 'Archiwalny' && !this._type.name.match(/AQM/i)) {
            if (this._admin && this._admin.id)
                test = (await this._admin.getSystemRole()).systemRoleId <= 3;
            if (!test && this._manager && this._manager.id)
                test = (await this._manager.getSystemRole()).systemRoleId <= 3
        }
        return test;
    }
    /** wstawia wiersz nagłówka kontratu - bez zadań */
    async addInScrum(auth: OAuth2Client) {
        if (await this.shouldBeInScrum()) {
            const currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;

            await ToolsSheets.insertRows(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                sheetId: Setup.ScrumSheet.CurrentSprint.id,
                startIndex: Setup.ScrumSheet.CurrentSprint.firstDataRow - 1,
                endIndex: Setup.ScrumSheet.CurrentSprint.firstDataRow,
            });

            await ToolsSheets.copyPasteRows(auth, {
                source: {
                    sheetId: Setup.ScrumSheet.CurrentSprint.id,
                    startRowIndex: Setup.ScrumSheet.CurrentSprint.firstDataRow,
                    endRowIndex: Setup.ScrumSheet.CurrentSprint.firstDataRow + 1,
                },
                destination: {
                    sheetId: Setup.ScrumSheet.CurrentSprint.id,
                    startRowIndex: Setup.ScrumSheet.CurrentSprint.firstDataRow - 1,
                    endRowIndex: Setup.ScrumSheet.CurrentSprint.firstDataRow,
                },
                spreadsheetId: Setup.ScrumSheet.GdId,
                pasteType: 'PASTE_FORMAT'
            })


            const projectIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.projectIdColName) + 1;
            const ourId_Alias = `${this.ourId} [${this.alias || ''}]`.trim();

            await ToolsSheets.updateValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: `${Setup.ScrumSheet.CurrentSprint.name}!${ToolsSheets.R1C1toA1(Setup.ScrumSheet.CurrentSprint.firstDataRow, projectIdColNumber)}`,
                values: [[this.projectOurId,
                    0,
                this.ourId, 0, 0, 0, 0,
                (this._manager) ? this._manager.id : '', '',
                `=HYPERLINK("${this._gdFolderUrl}";"${ourId_Alias} ${this._manager ? this._manager.name : ''}")`,
                    '', '', '', 'd', 'd', 'd', 'd', 'd'
                ]]
            });
        }
    }
    /**zmienia dane w nagłówku kontraktu i odnosniki */
    async editInScrum(auth: OAuth2Client) {
        if (await this.shouldBeInScrum()) {
            const currentSprintValues = <any[][]>(await ToolsSheets.getValues(auth, {
                spreadsheetId: Setup.ScrumSheet.GdId,
                rangeA1: Setup.ScrumSheet.CurrentSprint.name
            })).values;
            const projectIdColNumber = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.projectIdColName) + 1;
            const contractOurIdColIndex = currentSprintValues[0].indexOf(Setup.ScrumSheet.CurrentSprint.contractOurIdColName);

            let headerRowNumber = <number>Tools.findFirstInRange(this.ourId, currentSprintValues, contractOurIdColIndex) + 1;
            if (headerRowNumber) {
                //zmień dane w nagłowku
                const alias = this.alias ? `[${this.alias}] ` : ''
                const managerName = this._manager ? `${this._manager.name} ${this._manager.surname}` : '';
                const headerCaption = this.ourId + ' ' + alias + managerName;

                ToolsSheets.updateValues(auth, {
                    spreadsheetId: Setup.ScrumSheet.GdId,
                    rangeA1: `${Setup.ScrumSheet.CurrentSprint.name}!${ToolsSheets.R1C1toA1(headerRowNumber, projectIdColNumber)}`,
                    //values: [[`=SUM(R[1]C:R[${rowsCount}]C)`]]
                    values: [[
                        this.projectOurId,
                        0,
                        this.ourId, 0, 0, 0, 0,
                        this._manager ? <number>this._manager.id : '', '',
                        `=HYPERLINK("${this._gdFolderUrl}";"${headerCaption}")`,
                        '', '', '', 'd', 'd', 'd', 'd', 'd'
                    ]]
                })

                ScrumSheet.CurrentSprint.editRowsByColValue(auth, {
                    searchColName: Setup.ScrumSheet.CurrentSprint.contractOurIdColName,
                    valueToFind: this.ourId,
                    firstColumnName: Setup.ScrumSheet.CurrentSprint.contractOurIdColName,
                    values: [[this.ourId]],
                    //majorDimension: 'COLUMNS'
                })
            } else {
                await this.addInScrum(auth);
                await this.addTasksInScrum(auth);

                await ScrumSheet.CurrentSprint.setSumInContractRow(auth, this.ourId);
                await ScrumSheet.CurrentSprint.sortContract(auth, this.ourId);

                await ScrumSheet.CurrentSprint.makeTimesSummary(auth);
                await ScrumSheet.CurrentSprint.makePersonTimePerTaskFormulas(auth);

            }
        } else
            this.deleteFromScrum(auth);
    }

    async deleteFromScrum(auth: OAuth2Client) {
        ScrumSheet.CurrentSprint.deleteRowsByColValue(auth, {
            searchColName: Setup.ScrumSheet.CurrentSprint.contractOurIdColName,
            valueToFind: this.ourId
        });
    }

    async createDefaultMilestones(auth: OAuth2Client) {
        await super.createDefaultMilestones(auth);
        await ScrumSheet.CurrentSprint.setSumInContractRow(auth, this.ourId);
        await ScrumSheet.CurrentSprint.sortContract(auth, this.ourId);

        await ScrumSheet.CurrentSprint.makeTimesSummary(auth);
        await ScrumSheet.CurrentSprint.makePersonTimePerTaskFormulas(auth);
    }
}