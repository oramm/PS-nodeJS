import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import BusinessObject from '../../BussinesObject';
import CurrentSprint from '../../ScrumSheet/CurrentSprint';
import Setup from '../../setup/Setup';
import Tools from '../../tools/Tools';
import ToolsGd from '../../tools/ToolsGd';
import ToolsSheets from '../../tools/ToolsSheets';
import {
    ExternalOfferData,
    MilestoneData,
    MilestoneDateData,
    MilestoneTypeData,
    OtherContractData,
    OurContractData,
    OurOfferData,
} from '../../types/types';
import ContractsController from '../ContractsController';
import MilestonesController from './MilestonesController';

export default class Milestone extends BusinessObject implements MilestoneData {
    id?: number;
    _tmpId?: string;
    number: number | undefined;
    name: string;
    _folderNumber?: string;
    description: string;
    _dates: MilestoneDateData[] = [];
    status?: string;
    typeId?: number;
    _type: MilestoneTypeData;
    contractId?: number;
    offerId?: number;
    _contract?: OurContractData | OtherContractData;
    _offer?: OurOfferData | ExternalOfferData;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    _folderName?: string;
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
        this._dates = initParamObject._dates || [];

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

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }

    async getParentContractFromDb() {
        if (!this._contract?.id)
            throw new Error('parent Contract does not have Id');
        return (await ContractsController.find([{ id: this._contract.id }]))[0];
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

    async editFolder(auth: OAuth2Client) {
        //sytuacja normalna - folder itnieje
        if (await this.checkFolder(auth)) {
            try {
                await ToolsGd.getFileOrFolderMetaDataById(
                    auth,
                    <string>this.gdFolderId
                );
            } catch (err) {
                return await MilestonesController.createFolders(this, auth);
            }
            return await ToolsGd.updateFolder(auth, {
                name: this._folderName,
                id: this.gdFolderId,
            });
        }
        //kamień nie miał wcześniej typu albo coś poszło nie tak przy tworzeniu folderu
        else return await MilestonesController.createFolders(this, auth);
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
                CurrentSprint.makeTimesSummary(auth);
            }
        }
    }
}
