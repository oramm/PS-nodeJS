import ToolsGd from '../tools/ToolsGd';
import FinancialAidProgrammeRepository, {FinancialAidProgrammesSearchParams} from './FinancialAidProgrammeRepository';
import FinancialAidProgramme from './FinancialAidProgramme';
import { OAuth2Client } from 'google-auth-library';
import BaseController from '../controllers/BaseController';
import FinancialAidProgrammeGdController from './FinancialAidProgrammeGdController';
import { FinancialAidProgrammeData } from '../types/types';

export type { FinancialAidProgrammesSearchParams };

export default class FinancialAidProgrammesController extends BaseController<
    FinancialAidProgramme, 
    FinancialAidProgrammeRepository
> {
    private static instance: FinancialAidProgrammesController;
    
    constructor() {
        super(new FinancialAidProgrammeRepository());
    }

    private static getInstance(): FinancialAidProgrammesController {
        if (!this.instance) {
            this.instance = new FinancialAidProgrammesController();
        }
        return this.instance;
    }

    static async find(
        searchParams: FinancialAidProgrammesSearchParams[] = []
    ): Promise<FinancialAidProgramme[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    static async addNewFinancialAidProgramme(
        financialAidProgrammeData: FinancialAidProgrammeData,
        auth: OAuth2Client
    ): Promise<FinancialAidProgramme> {
        const instance = this.getInstance();
        const item = new FinancialAidProgramme(financialAidProgrammeData);
        const gdController = new FinancialAidProgrammeGdController();
        try {
            console.group('Creating new Programme');
            const gdFolder = await gdController
                .createFolder(auth, item)
                .catch((err) => {
                    console.log('Programme folder creation error');
                    throw err;
                });
            item.setGdFolderIdAndUrl(gdFolder.id as string);
            console.log('Programme folder created');
            await instance.create(item);
            console.log('Programme added to db');
            console.groupEnd();
            return item;
        } catch (err) {
            await gdController.deleteFromGd(auth, item.gdFolderId).catch(cleanupErr => console.error('Cleanup failed:', cleanupErr));
            throw err;
        }
    }

    static async updateFinancialAidProgramme(
        financialAidProgrammeData: FinancialAidProgrammeData,
        fieldsToUpdate: string[],
        auth: OAuth2Client
    ): Promise<FinancialAidProgramme> {
        const instance = this.getInstance();
        const item = new FinancialAidProgramme(financialAidProgrammeData);
        const gdController = new FinancialAidProgrammeGdController();
        try {
            console.group('Editing Programme');
            await ToolsGd.updateFolder(auth, {
                name: gdController.makeFolderName(item),
                id: item.gdFolderId,
            });
            console.log('Programme folder edited');
            await instance.edit(item, undefined, undefined, fieldsToUpdate);
            console.log('Programme edited in db');
            console.groupEnd();
            return item;
        } catch (err) {
            console.log('Programme edit error');
            throw err;
        }
    }

    static async deleteFinancialAidProgramme(
        financialAidProgrammeData: FinancialAidProgrammeData,
        auth: OAuth2Client
    ): Promise<void> {
        const instance = this.getInstance();
        const item = new FinancialAidProgramme(financialAidProgrammeData);
        const gdController = new FinancialAidProgrammeGdController();
        console.group('Deleting Programme');
        await Promise.all([
            instance.delete(item),
            gdController.deleteFromGd(auth, item.gdFolderId)
        ]);
        console.log(`Programme with id ${item.id} deleted from db and GDrive`);
        console.groupEnd();
    }
}
