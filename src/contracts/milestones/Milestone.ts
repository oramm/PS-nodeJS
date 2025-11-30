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
     * Aktualizuje nazwę folderu w Google Drive
     * UWAGA: Jeśli folder nie istnieje, zwraca false (Controller powinien wtedy wywołać createFolders)
     *
     * @param auth - OAuth2Client dla operacji GD
     * @returns true jeśli folder został zaktualizowany, false jeśli folder nie istnieje
     */
    async updateFolderName(auth: OAuth2Client): Promise<boolean> {
        // Folder nie istnieje - sygnalizujemy to Controllerowi
        if (!(await this.checkFolder(auth))) {
            return false;
        }

        // Folder istnieje - sprawdź czy jest dostępny i zaktualizuj
        try {
            await ToolsGd.getFileOrFolderMetaDataById(
                auth,
                <string>this.gdFolderId
            );
            await ToolsGd.updateFolder(auth, {
                name: this._folderName,
                id: this.gdFolderId,
            });
            return true;
        } catch (err) {
            // Folder istnieje ale jest niedostępny - sygnalizujemy to Controllerowi
            return false;
        }
    }

    /**
     * @deprecated Użyj MilestonesController.editFolder() zamiast tego.
     * Model nie powinien wywoływać Controller (Clean Architecture).
     *
     * MIGRACJA:
     * ```typescript
     * // STARE:
     * await milestone.editFolder(auth);
     *
     * // NOWE:
     * await MilestonesController.editFolder(milestone, auth);
     * ```
     */
    async editFolder(auth: OAuth2Client): Promise<void> {
        // Próbuj zaktualizować folder
        const updated = await this.updateFolderName(auth);
        if (!updated) {
            // Folder nie istnieje - rzuć błąd (Controller powinien obsłużyć tworzenie)
            throw new Error(
                'Folder does not exist or is inaccessible. Use MilestonesController.editFolder() instead.'
            );
        }
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
