import { OAuth2Client } from 'google-auth-library';
import BusinessObject from '../BussinesObject';
import TaskStore from '../setup/Sessions/IntersessionsTasksStore';
import Setup from '../setup/Setup';
import EnviErrors from '../tools/Errors';
import ToolsDate from '../tools/ToolsDate';
import ToolsGd from '../tools/ToolsGd';
import {
    CityData,
    ContractTypeData,
    OfferData,
    OfferEventData,
} from '../types/types';
import OfferGdController from './gdControllers/OfferGdController';
import OfferEvent from './offerEvent/OfferEvent';

export default abstract class Offer
    extends BusinessObject
    implements OfferData
{
    id?: number;
    alias: string;
    creationDate?: string;
    description?: string;
    comment?: string;
    emailAdditionalContent?: string;
    submissionDeadline?: string;
    _type: ContractTypeData;
    typeId: number;
    _city: CityData;
    cityId?: number;
    form?: string;
    isOur: boolean;
    bidProcedure?: string;
    employerName?: string;
    status?: string;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    _lastEvent?: OfferEvent | null;
    constructor(initParamObject: OfferData) {
        super({ ...initParamObject, _dbTableName: 'Offers' });
        if (!initParamObject._type.id)
            throw new Error('Type id is not defined');
        if (!initParamObject._employer && !initParamObject.employerName)
            throw new Error('Employer name or is not defined');

        // Validate city data - require either id or valid name
        if (
            !initParamObject._city.id &&
            (!initParamObject._city.name ||
                initParamObject._city.name.trim() === '')
        )
            throw new Error('City id or name must be defined');

        this.id = initParamObject.id;
        this.alias = initParamObject.alias.trim();
        this.description = initParamObject.description?.trim();

        this.comment = initParamObject.comment?.trim() ?? undefined;
        if (initParamObject.creationDate)
            this.creationDate = ToolsDate.dateJsToSql(
                initParamObject.creationDate
            ) as string;
        if (initParamObject.submissionDeadline)
            this.submissionDeadline = ToolsDate.dateJsToSql(
                initParamObject.submissionDeadline
            ) as string;
        this._type = initParamObject._type;
        this._city = initParamObject._city;
        this.cityId = initParamObject._city.id;
        this.typeId = initParamObject._type.id;

        this.form = initParamObject.form?.trim() ?? undefined;
        this.isOur = initParamObject.isOur;
        this.bidProcedure = initParamObject.bidProcedure?.trim() ?? undefined;
        this.employerName =
            initParamObject._employer?.name?.trim() ||
            (<string>initParamObject.employerName).trim();
        this.status = initParamObject.status;
        this.gdFolderId = initParamObject.gdFolderId;
        if (initParamObject.gdFolderId)
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(
                initParamObject.gdFolderId
            );
        this.initLastEvent(initParamObject._lastEvent); //przy nowej ofercie lastEvent jeszcze nie istnieje
    }

    private initLastEvent(lastEventData: OfferEventData | undefined | null) {
        if (!lastEventData?.offerId) return;
        if (lastEventData) {
            lastEventData.offerId = this.id;
            this._lastEvent = new OfferEvent(lastEventData);
        } else this._lastEvent = null;
    }

    shouldEditGdElements(_fieldsToUpdate: string[] | undefined) {
        console.log('shouldEditGdElements', _fieldsToUpdate);
        if (!_fieldsToUpdate) return true;
        return _fieldsToUpdate.includes('submissionDeadline');
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }
    /**tworzy folder główny oferty */
    async createGdElements(auth: OAuth2Client) {
        const offerGdController = new OfferGdController();
        const gdFolder = await offerGdController.createOfferFolder(auth, {
            ...this,
        });
        if (!gdFolder.id) throw new Error('Folder  not created');
        this.setGdFolderIdAndUrl(<string>gdFolder.id);
    }

    //tymczasowa funkcja
    setBidValidityDate() {
        if (!this.submissionDeadline) throw new Error('Brak terminu składania');
        let bidValidityDate: Date;
        let validityDays = 90;
        if (this.bidProcedure === Setup.OfferBidProcedure.REQUEST_FOR_QUOTATION)
            validityDays = 30;
        if (this.bidProcedure === Setup.OfferBidProcedure.TENDER_PL)
            validityDays = 60;

        bidValidityDate = ToolsDate.addDays(
            this.submissionDeadline,
            validityDays
        );
        const bidValidityDateStr = ToolsDate.dateJsToSql(bidValidityDate);
        if (!bidValidityDateStr) throw new Error('Błąd daty');
        return bidValidityDateStr;
    }

    async editGdElements(auth: OAuth2Client, taskId?: string) {
        const percent = TaskStore.getPercent(taskId) || 0;
        if (!this.submissionDeadline) throw new Error('Brak terminu składania');
        const letterGdFolder = await ToolsGd.getFileOrFolderMetaDataById(
            auth,
            <string>this.gdFolderId
        );
        const offerGdController = new OfferGdController();
        const newFolderName = offerGdController.makeFolderName(
            this._type.name,
            this.alias,
            this.submissionDeadline
        );
        if (letterGdFolder.name !== newFolderName) {
            TaskStore.update(
                taskId,
                'Edytuję nazwę folderu oferty',
                percent + 10
            );
            await ToolsGd.updateFolder(auth, {
                name: newFolderName,
                id: letterGdFolder.id,
            });
        }
        return letterGdFolder;
    }
    /**
     * Zwraca dane folderu "01 Przygotowanie oferty" z folderu głównego oferty
     * @param auth - obiekt autoryzacji
     * @returns
     */
    async getOfferPreparationFolderDataFromGd(auth: OAuth2Client) {
        if (!this.gdFolderId)
            throw new EnviErrors.NoGdIdError('Brak Id folderu głównego oferty');
        const offerIssueMilestoneFolderData =
            await ToolsGd.getFileMetaDataByName(auth, {
                parentId: this.gdFolderId,
                fileName: '01 Składanie ofert',
            });
        if (!offerIssueMilestoneFolderData || !offerIssueMilestoneFolderData.id)
            throw new Error('Brak folderu "01 Składanie ofert"');

        const offerPreparationFolderData = await ToolsGd.getFileMetaDataByName(
            auth,
            {
                parentId: offerIssueMilestoneFolderData.id,
                fileName: '01 Przygotowanie oferty',
            }
        );
        if (!offerPreparationFolderData || !offerPreparationFolderData.id)
            throw new Error('Brak folderu "01 Przygotowanie oferty"');

        return offerPreparationFolderData;
    }

    /**
     * Zwraca dane folderu z plikami oferty pliki są w folderze "01. Przygotowanie oferty"
     * Nie ma folderu "oferta" jak w ExternalOffer
     */
    async getOfferFilesData(auth: OAuth2Client) {
        const offerFilesFolderData =
            await this.getOfferPreparationFolderDataFromGd(auth);

        // Get all files from the folder
        const offerFiles = await ToolsGd.getFilesMetaData(
            auth,
            offerFilesFolderData.id!
        );

        // Filter files to include only PDF, Excel, ZIP, and Word files
        const filteredFiles = offerFiles.filter((file) => {
            const mimeType = file.mimeType;
            return (
                mimeType === 'application/pdf' ||
                mimeType === 'application/vnd.ms-excel' ||
                mimeType ===
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                mimeType ===
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                mimeType === 'application/msword' ||
                mimeType === 'application/zip'
            );
        });

        return filteredFiles;
    }
}
