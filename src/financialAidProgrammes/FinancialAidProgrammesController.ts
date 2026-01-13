import ToolsGd from '../tools/ToolsGd';
import FinancialAidProgrammeRepository, {
    FinancialAidProgrammesSearchParams,
} from './FinancialAidProgrammeRepository';
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

    /**
     * CREATE - tworzy program z DTO
     * Router powinien wywoływać tę metodę.
     */
    static async addFromDto(
        dto: FinancialAidProgrammeData,
        auth?: OAuth2Client
    ): Promise<FinancialAidProgramme> {
        const item = new FinancialAidProgramme(dto);
        return await this.add(item, auth);
    }

    /**
     * CREATE - dodaje program (folder GD + baza)
     */
    static async add(
        item: FinancialAidProgramme,
        auth?: OAuth2Client
    ): Promise<FinancialAidProgramme> {
        return await this.withAuth(async (instance, authClient) => {
            const gdController = new FinancialAidProgrammeGdController();
            try {
                console.group('Creating new Programme');
                const gdFolder = await gdController.createFolder(
                    authClient,
                    item
                );
                item.setGdFolderIdAndUrl(gdFolder.id as string);
                console.log('Programme folder created');
                await instance.create(item);
                console.log('Programme added to db');
                console.groupEnd();
                return item;
            } catch (err) {
                console.groupEnd();
                await gdController
                    .deleteFromGd(authClient, item.gdFolderId)
                    .catch((e) => console.error('Cleanup failed:', e));
                throw err;
            }
        }, auth);
    }

    /**
     * UPDATE - edytuje program z DTO
     * Router powinien wywoływać tę metodę.
     */
    static async editFromDto(
        dto: FinancialAidProgrammeData,
        fieldsToUpdate: string[],
        auth?: OAuth2Client
    ): Promise<FinancialAidProgramme> {
        const item = new FinancialAidProgramme(dto);
        return await this.editProgramme(item, fieldsToUpdate, auth);
    }

    /**
     * UPDATE - edytuje program (folder GD + baza)
     */
    static async editProgramme(
        item: FinancialAidProgramme,
        fieldsToUpdate: string[],
        auth?: OAuth2Client
    ): Promise<FinancialAidProgramme> {
        return await this.withAuth(async (instance, authClient) => {
            const gdController = new FinancialAidProgrammeGdController();
            console.group('Editing Programme');
            await ToolsGd.updateFolder(authClient, {
                name: gdController.makeFolderName(item),
                id: item.gdFolderId,
            });
            console.log('Programme folder edited');
            await instance.edit(item, undefined, undefined, fieldsToUpdate);
            console.log('Programme edited in db');
            console.groupEnd();
            return item;
        }, auth);
    }

    /**
     * DELETE - usuwa program z DTO
     * Router powinien wywoływać tę metodę.
     */
    static async deleteFromDto(
        dto: FinancialAidProgrammeData,
        auth?: OAuth2Client
    ): Promise<void> {
        const item = new FinancialAidProgramme(dto);
        return await this.deleteProgramme(item, auth);
    }

    /**
     * DELETE - usuwa program (folder GD + baza)
     */
    static async deleteProgramme(
        item: FinancialAidProgramme,
        auth?: OAuth2Client
    ): Promise<void> {
        return await this.withAuth(async (instance, authClient) => {
            const gdController = new FinancialAidProgrammeGdController();
            console.group('Deleting Programme');
            await Promise.all([
                instance.delete(item),
                gdController.deleteFromGd(authClient, item.gdFolderId),
            ]);
            console.log(`Programme ${item.id} deleted from db and GDrive`);
            console.groupEnd();
        }, auth);
    }

    /**
     * @deprecated Użyj `addFromDto(dto)` lub `add(item, auth)`.
     */
    static async addNewFinancialAidProgramme(
        dto: FinancialAidProgrammeData,
        auth: OAuth2Client
    ): Promise<FinancialAidProgramme> {
        return await this.add(new FinancialAidProgramme(dto), auth);
    }

    /**
     * @deprecated Użyj `editFromDto(dto, fields)` lub `editProgramme(item, fields, auth)`.
     */
    static async updateFinancialAidProgramme(
        dto: FinancialAidProgrammeData,
        fieldsToUpdate: string[],
        auth: OAuth2Client
    ): Promise<FinancialAidProgramme> {
        return await this.editProgramme(
            new FinancialAidProgramme(dto),
            fieldsToUpdate,
            auth
        );
    }

    /**
     * @deprecated Użyj `deleteFromDto(dto)` lub `deleteProgramme(item, auth)`.
     */
    static async deleteFinancialAidProgramme(
        dto: FinancialAidProgrammeData,
        auth: OAuth2Client
    ): Promise<void> {
        await this.deleteProgramme(new FinancialAidProgramme(dto), auth);
    }
}
