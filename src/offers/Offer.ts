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
import MilestonesController from '../contracts/milestones/MilestonesController';
import CasesController from '../contracts/milestones/cases/CasesController';

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
            if (!this._city.id) await this.addNewCity();
            await this.createGdElements(auth);
            console.log('Offer folder created');
            await this.addInDb();
            console.log('Offer added in db');
            console.group(
                'Creating default milestones for offer submission milestone'
            );
            await this.createDefaultMilestones(
                auth,
                Setup.MilestoneTypes.OFFER_SUBMISSION
            );
            await this.createOfferEvaluationMilestoneOrCases(auth);
            console.groupEnd();
        } catch (err) {
            this.deleteController(auth);
            throw err;
        }
    }

    async editController(auth: OAuth2Client) {
        try {
            console.group('Editing offer');
            if (!this._city.id) this.addNewCity();
            await this.editGdElements(auth);
            console.log('Offer folder edited');
            await this.editInDb();
            console.log('Offer edited in db');
            await this.createOfferEvaluationMilestoneOrCases(auth);
            console.log('Offer succesfully edited');
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

    private async addNewCity() {
        const _city = new City(this._city);
        await _city.addNewController();
        this._city = _city;
        console.log(
            'City added inDB with generated code:',
            _city.name,
            _city.code
        );
    }

    async createOfferEvaluationMilestoneOrCases(auth: OAuth2Client) {
        const offerEvaluationMilestone =
            await this.getOfferEvaluationMilestone();

        if (
            this.status === Setup.OfferStatus.NOT_INTERESTED ||
            this.status === Setup.OfferStatus.DECISION_PENDING
        ) {
            if (offerEvaluationMilestone) {
                await this.deleteOfferEvaluationMilestone(auth);
            }
            return;
        }
        if (!offerEvaluationMilestone) {
            await this.createOfferEvaluationMilestone(auth);
            return;
        }

        await this.ensureDefaultCases(offerEvaluationMilestone, auth);
    }

    private async getOfferEvaluationMilestone() {
        return (
            await MilestonesController.getMilestonesList(
                [
                    {
                        typeId: Setup.MilestoneTypes.OFFER_EVALUATION,
                        offerId: this.id,
                    },
                ],
                'OFFER'
            )
        )[0];
    }

    private async ensureDefaultCases(milestone: any, auth: OAuth2Client) {
        const offerEvaluationCases = await CasesController.getCasesList([
            {
                offerId: this.id,
                milestoneTypeId: Setup.MilestoneTypes.OFFER_EVALUATION,
            },
        ]);

        if (offerEvaluationCases.length === 0) {
            await milestone.createDefaultCases(auth, { isPartOfBatch: false });
        }
    }

    private async createOfferEvaluationMilestone(auth: OAuth2Client) {
        console.log('Creating milestone for offer evaluation');
        await this.createDefaultMilestones(
            auth,
            Setup.MilestoneTypes.OFFER_EVALUATION
        );
    }

    private async deleteOfferEvaluationMilestone(auth: OAuth2Client) {
        const milestone = await this.getOfferEvaluationMilestone();
        if (milestone) {
            await milestone.deleteController(auth);
        }
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
        const gdFolder = await offerGdController.createOfferFolder(auth, {
            ...this,
        });
        if (!gdFolder.id) throw new Error('Folder  not created');
        this.setGdFolderIdAndUrl(<string>gdFolder.id);
    }
    /**tworzy domyślne kamienie milowe dla oferty ale tylko
     * dla kamienni typu OFFER_SUBMISSION. pozostałe kamienie będą tworzone przy ustawieniu statusu
     */
    async createDefaultMilestones(auth: OAuth2Client, milestoneTypeId: number) {
        const defaultMilestones: Milestone[] = [];

        const defaultMilestoneTemplates =
            await MilestoneTemplatesController.getMilestoneTemplatesList(
                {
                    isDefaultOnly: true,
                    contractTypeId: this.typeId,
                    milestoneTypeId,
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
