import FocusArea from './FocusArea';
import FocusAreaRepository, { FocusAreasSearchParams } from './FocusAreaRepository';
import BaseController from '../../controllers/BaseController';
import { OAuth2Client } from 'google-auth-library';
import FocusAreaGdController from './FocusAreaGdController';
import ToolsGd from '../../tools/ToolsGd';
import { FocusAreaData } from '../../types/types';

export type {FocusAreasSearchParams };

export default class FocusAreasController extends BaseController<
    FocusArea,
    FocusAreaRepository
> {
    private static instance: FocusAreasController;

    constructor() {
        super(new FocusAreaRepository());
    }

    private static getInstance(): FocusAreasController {
        if (!this.instance) {
            this.instance = new FocusAreasController();
        }
        return this.instance;
    }

    static async find(
        searchParams: FocusAreasSearchParams[] = []
    ): Promise<FocusArea[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    static async addNewFocusArea(
        focusAreaData: FocusAreaData, 
        auth: OAuth2Client
    ): Promise<FocusArea> {
        const instance = this.getInstance();
        const item = new FocusArea(focusAreaData);
        const gdController = new FocusAreaGdController();
        try {
            console.group('Creating new FocusArea');
            const gdFolder = await gdController
                .createFolder(auth, item)
                .catch((err) => {
                    console.log('FocusArea folder creation error');
                    throw err;
                });
            item.setGdFolderIdAndUrl(gdFolder.id as string);
            console.log('FocusArea folder created');
            await instance.create(item);
            console.log(`FocusArea ${item.name} added in db`);
            console.groupEnd();
            return item;
        } catch (err) {
            console.error('Error creating FocusArea, attempting cleanup...');
            if (item.gdFolderId) {
                await gdController.deleteFromGd(auth, item.gdFolderId).catch(cleanupErr => console.error('Cleanup failed:', cleanupErr));
            }
            throw err;
        }
    }

    static async updateFocusArea(
        focusAreaData: FocusAreaData,
        fieldsToUpdate: string[],
        auth: OAuth2Client
    ): Promise<FocusArea> {
        const instance = this.getInstance();
        const item = new FocusArea(focusAreaData);
        const gdController = new FocusAreaGdController();
        try {
            console.group('Editing FocusArea');
            await ToolsGd.updateFolder(auth, {
                name: gdController.makeFolderName(item),
                id: item.gdFolderId,
            });
            console.log('FocusArea folder edited');
            await instance.edit(item, undefined, undefined, fieldsToUpdate);
            console.log('FocusArea edited in db');
            console.groupEnd();
            return item;
        } catch (err) {
            console.log('FocusArea edit error');
            throw err;
        }
    }

    static async deleteFocusArea(
        focusAreaData: FocusAreaData, 
        auth: OAuth2Client
    ): Promise<void> {
        const instance = this.getInstance();
        const item = new FocusArea(focusAreaData);
        const gdController = new FocusAreaGdController();
        console.group('Deleting FocusArea');
        await Promise.all([
            instance.delete(item),
            gdController.deleteFromGd(auth, item.gdFolderId)
        ]);
        console.log(`FocusArea with id ${item.id} deleted from db and Google Drive`);
        console.groupEnd();
    }

    
}
