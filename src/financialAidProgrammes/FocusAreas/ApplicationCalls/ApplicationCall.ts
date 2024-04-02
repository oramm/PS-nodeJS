import BusinessObject from '../../../BussinesObject';
import ToolsDate from '../../../tools/ToolsDate';
import ToolsGd from '../../../tools/ToolsGd';
import { ApplicationCallData, FocusAreaData } from '../../../types/types';
import { OAuth2Client } from 'google-auth-library';
import ApplicationCallGdController from './ApplicationCallGdController';

export default class ApplicationCall
    extends BusinessObject
    implements ApplicationCallData
{
    id?: number;
    focusAreaId: number;
    _focusArea: FocusAreaData;
    description: string;
    url: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    gdFolderId!: string;
    _gdFolderUrl?: string;

    constructor(initParamObject: ApplicationCallData) {
        super({ ...initParamObject, _dbTableName: 'ApplicationCalls' });
        if (!initParamObject.focusAreaId && !initParamObject._focusArea.id)
            throw new Error('FocusAreaId is required');
        if (!initParamObject.startDate)
            throw new Error('startDate is required');
        if (!initParamObject.endDate) throw new Error('endDate is required');
        this.focusAreaId = (initParamObject.focusAreaId ??
            initParamObject._focusArea.id) as number;
        this._focusArea = initParamObject._focusArea;
        this.description = initParamObject.description;
        this.url = initParamObject.url;
        this.startDate = ToolsDate.dateJsToSql(
            initParamObject.startDate
        ) as string;
        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate) as string;
        this.status = initParamObject.status;
        this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
    }

    async addNewController(auth: OAuth2Client) {
        try {
            const gdController = new ApplicationCallGdController();
            console.group('Creating new ApplicationCall');
            const gdFolder = await gdController
                .createFolder(auth, {
                    ...this,
                })
                .catch((err) => {
                    console.log('ApplicationCall folder creation error');
                    throw err;
                });
            this.setGdFolderIdAndUrl(gdFolder.id as string);

            console.log('ApplicationCall folder created');
            await this.addInDb();
            console.log('ApplicationCall added to db');
            console.groupEnd();
        } catch (err) {
            this.deleteController(auth);
            throw err;
        }
    }

    async editController(auth: OAuth2Client) {
        try {
            console.group('Editing ApplicationCall');
            const gdController = new ApplicationCallGdController();
            await ToolsGd.updateFolder(auth, {
                name: gdController.makeFolderName({ ...this }),
                id: this.gdFolderId,
            });
            console.log('ApplicationCall folder edited');
            await this.editInDb();
            console.log('ApplicationCall edited in db');
            console.groupEnd();
        } catch (err) {
            console.log('ApplicationCall edit error');
            throw err;
        }
    }

    async deleteController(auth: OAuth2Client) {
        if (!this.gdFolderId) throw new Error('Brak folderu programu');
        if (this.id) await this.deleteFromDb();
        const gdController = new ApplicationCallGdController();
        await gdController.deleteFromGd(auth, this.gdFolderId);
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }
}
