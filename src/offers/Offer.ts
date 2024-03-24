import City from '../Admin/Cities/City';
import BusinessObject from '../BussinesObject';
import mysql from 'mysql2/promise';
import ToolsDate from '../tools/ToolsDate';
import ToolsGd from '../tools/ToolsGd';
import {
    CityData,
    ContractTypeData,
    OfferData,
    PersonData,
} from '../types/types';
import { OAuth2Client } from 'google-auth-library';
import MilestoneTemplatesController from '../contracts/milestones/milestoneTemplates/MilestoneTemplatesController';
import Milestone from '../contracts/milestones/Milestone';
import ToolsDb from '../tools/ToolsDb';
import OfferGdController from './gdControllers/OfferGdController';
import Setup from '../setup/Setup';

export default abstract class Offer
    extends BusinessObject
    implements OfferData
{
    id?: number;
    alias: string;
    creationDate?: string;
    description?: string;
    comment?: string;
    submissionDeadline?: string;
    _type: ContractTypeData;
    typeId: number;
    _city: CityData;
    cityId?: number;
    form?: string;
    isOur: boolean;
    bidProcedure?: string;
    _editor?: PersonData;
    editorId?: number;
    _lastUpdated?: string;
    employerName?: string;
    status?: string;
    gdFolderId?: string;
    _gdFolderUrl?: string;

    constructor(initParamObject: OfferData) {
        super({ ...initParamObject, _dbTableName: 'Offers' });
        if (!initParamObject._city.id)
            throw new Error('City id is not defined');
        if (!initParamObject._type.id)
            throw new Error('Type id is not defined');
        if (!initParamObject._employer && !initParamObject.employerName)
            throw new Error('Employer name or is not defined');
        if (!initParamObject._editor?.id)
            throw new Error('Editor id is not defined');

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
        this._editor = initParamObject._editor;
        this.editorId = initParamObject._editor.id;
        this._lastUpdated = initParamObject._lastUpdated;
        this.employerName =
            initParamObject._employer?.name?.trim() ||
            (<string>initParamObject.employerName).trim();
        this.status = initParamObject.status;
        this.gdFolderId = initParamObject.gdFolderId;
        if (initParamObject.gdFolderId)
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(
                initParamObject.gdFolderId
            );
    }

    async addNewController(auth: OAuth2Client) {
        try {
            console.group('Creating new offer');
            await this.createGdElements(auth);
            console.log('Offer folder created');
            await this.addInDb();
            console.log('Offer added to db');
            console.group('Creating default milestones');
            await this.createDefaultMilestones(auth);
            console.groupEnd();
        } catch (err) {
            this.deleteController(auth);
            throw err;
        }
    }

    async editController(auth: OAuth2Client) {
        try {
            console.group('Editing offer');
            await this.editGdElements(auth);
            console.log('Offer folder edited');
            await this.editInDb();
            console.log('Offer edited in db');
            console.groupEnd();
        } catch (err) {
            console.log('Offer edit error');
            throw err;
        }
    }

    async deleteController(auth: OAuth2Client) {
        if (!this.gdFolderId) throw new Error('Brak folderu oferty');
        if (this.id) await this.deleteFromDb();
        const offerGdController = new OfferGdController();
        await offerGdController.deleteFromGd(auth, this.gdFolderId);
    }

    setCity(cityOrCityName: City | string) {
        if (typeof cityOrCityName === 'string') {
            const city = new City({ name: cityOrCityName, code: '' });
            city.addInDb();
            this._city = city;
            this.cityId = city.id as number;
        } else {
            this._city = cityOrCityName;
            this.cityId = cityOrCityName.id as number;
        }
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }
    /**tworzy folder główny oferty */
    async createGdElements(auth: OAuth2Client) {
        const offerGdController = new OfferGdController();
        const gdFolder = await offerGdController.createOfferFolder(auth, this);
        if (!gdFolder.id) throw new Error('Folder  not created');
        this.setGdFolderIdAndUrl(<string>gdFolder.id);
    }

    async createDefaultMilestones(auth: OAuth2Client) {
        const defaultMilestones: Milestone[] = [];

        const defaultMilestoneTemplates =
            await MilestoneTemplatesController.getMilestoneTemplatesList(
                {
                    isDefaultOnly: true,
                    contractTypeId: this.typeId,
                },
                'OFFER'
            );

        for (let i = 0; i < defaultMilestoneTemplates.length; i++) {
            const template = defaultMilestoneTemplates[i];
            const milestone = new Milestone({
                name: template.name,
                description: template.description,
                _type: template._milestoneType,
                _offer: this as any,
                status: 'Nie rozpoczęty',
                endDate: i
                    ? this.submissionDeadline
                    : this.setBidValidityDate(),
            });

            await milestone.createFolders(auth);
            defaultMilestones.push(milestone);
        }
        console.log('Milestones folders created');
        await this.addDefaultMilestonesInDb(defaultMilestones);
        console.log('default milestones saved in db');

        for (const milestone of defaultMilestones) {
            console.group(
                `--- creating default cases for milestone ${milestone._FolderNumber_TypeName_Name} ...`
            );
            await milestone.createDefaultCases(auth, { isPartOfBatch: true });
        }
        console.groupEnd();
    }
    //tymczasowa funkcja
    private setBidValidityDate() {
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

    private async addDefaultMilestonesInDb(
        milestones: Milestone[],
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ) {
        if (!externalConn && isPartOfTransaction)
            throw new Error(
                'Transaction is not possible without external connection'
            );
        const conn = externalConn
            ? externalConn
            : await ToolsDb.getPoolConnectionWithTimeout();
        if (!externalConn)
            console.log(
                'new connection:: addDefaultMilestonesInDb ',
                conn.threadId
            );
        try {
            await conn.beginTransaction();
            const promises = [];
            for (const milestone of milestones)
                promises.push(milestone.addInDb(conn, true));
            await Promise.all(promises);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            if (!externalConn) {
                conn.release();
                console.log(
                    'connection released:: addDefaultMilestonesInDb',
                    conn.threadId
                );
            }
        }
    }

    async editGdElements(auth: OAuth2Client) {
        if (!this.submissionDeadline) throw new Error('Brak terminu składania');
        const letterGdFolder = await ToolsGd.getFileOrFolderById(
            auth,
            <string>this.gdFolderId
        );
        const offerGdController = new OfferGdController();
        const newFolderName = offerGdController.makeFolderName(
            this._type.name,
            this.alias,
            this.submissionDeadline
        );
        if (letterGdFolder.name !== newFolderName)
            await ToolsGd.updateFolder(auth, {
                name: newFolderName,
                id: letterGdFolder.id,
            });
        return letterGdFolder;
    }
}
