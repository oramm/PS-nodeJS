import BusinessObject from '../../BussinesObject';
import ToolsGd from '../../tools/ToolsGd';
import { FinancialAidProgrammeData, FocusAreaData } from '../../types/types';
import { OAuth2Client } from 'google-auth-library';
import FocusAreaGdController from './FocusAreaGdController';

export default class FocusArea extends BusinessObject implements FocusAreaData {
    id?: number;
    programmeId?: number;
    _programme: FinancialAidProgrammeData;
    name: string;
    alias: string;
    description: string;
    gdFolderId!: string;
    _gdFolderUrl?: string;

    constructor(initParamObject: FocusAreaData) {
        super({ ...initParamObject, _dbTableName: 'FocusAreas' });
        this.programmeId =
            initParamObject.programmeId || initParamObject._programme?.id;
        this._programme = initParamObject._programme;
        this.name = initParamObject.name;
        this.alias = initParamObject.alias;
        this.description = initParamObject.description;
        this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
    }

    async addNewController(auth: OAuth2Client) {
        try {
            const gdController = new FocusAreaGdController();
            console.group('Creating new FocusArea');
            const gdFolder = await gdController
                .createFolder(auth, {
                    ...this,
                })
                .catch((err) => {
                    console.log('FocusArea folder creation error');
                    throw err;
                });
            this.setGdFolderIdAndUrl(gdFolder.id as string);

            console.log('FocusArea folder created');
            await this.addInDb();
            console.log('FocusArea added to db');
            console.groupEnd();
        } catch (err) {
            this.deleteController(auth);
            throw err;
        }
    }

    async editController(auth: OAuth2Client) {
        try {
            console.group('Editing FocusArea');
            const gdController = new FocusAreaGdController();
            await ToolsGd.updateFolder(auth, {
                name: gdController.makeFolderName({ ...this }),
                id: this.gdFolderId,
            });
            console.log('FocusArea folder edited');
            await this.editInDb();
            console.log('FocusArea edited in db');
            console.groupEnd();
        } catch (err) {
            console.log('FocusArea edit error');
            throw err;
        }
    }

    async deleteController(auth: OAuth2Client) {
        if (!this.gdFolderId) throw new Error('Brak folderu programu');
        if (this.id) await this.deleteFromDb();
        const gdController = new FocusAreaGdController();
        await gdController.deleteFromGd(auth, this.gdFolderId);
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }
}
