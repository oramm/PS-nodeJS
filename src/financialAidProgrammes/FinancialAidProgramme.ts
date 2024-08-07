import BusinessObject from '../BussinesObject';
import { FinancialAidProgrammeData } from '../types/types';
import { OAuth2Client } from 'google-auth-library';
import FinancialAidProgrammeGdController from './FinancialAidProgrammeGdController';
import ToolsGd from '../tools/ToolsGd';

export default class FinancialAidProgramme
    extends BusinessObject
    implements FinancialAidProgrammeData
{
    id?: number;
    name: string;
    alias: string;
    description: string;
    url: string;
    gdFolderId!: string;
    _gdFolderUrl?: string;

    constructor(initParamObject: FinancialAidProgrammeData) {
        super({ ...initParamObject, _dbTableName: 'FinancialAidProgrammes' });
        this.name = initParamObject.name;
        this.alias = initParamObject.alias;
        this.description = initParamObject.description;
        this.url = initParamObject.url;
        this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
    }

    async addNewController(auth: OAuth2Client) {
        try {
            const gdController = new FinancialAidProgrammeGdController();
            console.group('Creating new Programme');
            const gdFolder = await gdController
                .createFolder(auth, {
                    ...this,
                })
                .catch((err) => {
                    console.log('Programme folder creation error');
                    throw err;
                });
            this.setGdFolderIdAndUrl(gdFolder.id as string);

            console.log('Programme folder created');
            await this.addInDb();
            console.log('Programme added to db');
            console.groupEnd();
        } catch (err) {
            this.deleteController(auth);
            throw err;
        }
    }

    async editController(auth: OAuth2Client) {
        try {
            console.group('Editing Programme');
            await ToolsGd.updateFolder(auth, {
                name: this.alias,
                id: this.gdFolderId,
            });
            console.log('Programme folder edited');
            await this.editInDb();
            console.log('Programme edited in db');
            console.groupEnd();
        } catch (err) {
            console.log('Programme edit error');
            throw err;
        }
    }

    async deleteController(auth: OAuth2Client) {
        if (!this.gdFolderId) throw new Error('Brak folderu programu');
        if (this.id) await this.deleteFromDb();
        const gdController = new FinancialAidProgrammeGdController();
        await gdController.deleteFromGd(auth, this.gdFolderId);
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }
}
