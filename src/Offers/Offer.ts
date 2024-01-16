import City from '../Admin/Cities/City';
import BusinessObject from '../BussinesObject';
import ContractType from '../contracts/contractTypes/ContractType';
import ToolsDate from '../tools/ToolsDate';
import ToolsGd from '../tools/ToolsGd';
import {
    CityData,
    ContractTypeData,
    OfferData,
    PersonData,
} from '../types/types';
import OfferGdController from './OfferGdController';
import { OAuth2Client } from 'google-auth-library';

export default abstract class Offer
    extends BusinessObject
    implements OfferData
{
    id?: number;
    alias: string;
    creationDate: string;
    description: string;
    submissionDeadline: string;
    _type: ContractTypeData;
    typeId: number;
    _city: CityData;
    cityId: number;
    form: string;
    isOur: boolean;
    bidProcedure: string;
    _editor: PersonData;
    editorId: number;
    _lastUpdated: string;
    employerName: string;
    status: string;
    gdFolderId: string;
    _gdFolderUrl: string;

    constructor(initParamObject: OfferData) {
        super({ _dbTableName: 'Offers' });
        if (!initParamObject._city.id)
            throw new Error('City id is not defined');
        if (!initParamObject._type.id)
            throw new Error('Type id is not defined');
        if (!initParamObject._employer && !initParamObject.employerName)
            throw new Error('Employer name or is not defined');
        if (!initParamObject._editor.id)
            throw new Error('Editor id is not defined');

        this.id = initParamObject.id;
        this.alias = initParamObject.alias.trim();
        this.description = initParamObject.description.trim();
        this.creationDate = ToolsDate.dateJsToSql(
            initParamObject.creationDate
        ) as string;
        this.submissionDeadline = ToolsDate.dateJsToSql(
            initParamObject.submissionDeadline
        ) as string;
        this._type = initParamObject._type;
        this._city = initParamObject._city;
        this.cityId = initParamObject._city.id;
        this.typeId = initParamObject._type.id;
        this.form = initParamObject.form.trim();
        this.isOur = initParamObject.isOur;
        this.bidProcedure = initParamObject.bidProcedure.trim();
        this._editor = initParamObject._editor;
        this.editorId = initParamObject._editor.id;
        this._lastUpdated = initParamObject._lastUpdated;
        this.employerName =
            initParamObject._employer?.name?.trim() ||
            (<string>initParamObject.employerName).trim();
        this.status = initParamObject.status;
        this.gdFolderId = initParamObject.gdFolderId;
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
        if (this.id) await this.deleteFromDb();
        await OfferGdController.deleteFromGd(auth, this.gdFolderId);
    }

    setCity(cityOrCityName: City | string) {
        if (typeof cityOrCityName === 'string') {
            const city = new City({ name: cityOrCityName });
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
        const gdFolder = await OfferGdController.createOfferFolder(auth, this);
        if (!gdFolder.id) throw new Error('Folder  not created');
        this.setGdFolderIdAndUrl(<string>gdFolder.id);
    }

    async editGdElements(auth: OAuth2Client) {
        const letterGdFolder = await ToolsGd.getFileOrFolderById(
            auth,
            <string>this.gdFolderId
        );
        const newFolderName = OfferGdController.makeFolderName(
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
