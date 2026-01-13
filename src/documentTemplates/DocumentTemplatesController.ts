import BaseController from '../controllers/BaseController';
import { DocumentTemplateData } from '../types/types';
import { UserData } from '../types/sessionTypes';
import DocumentTemplate from './DocumentTemplate';
import DocumentTemplateRepository, {
    DocumentTemplatesSearchParams,
} from './DocumentTemplateRepository';
import PersonsController from '../persons/PersonsController';

export type { DocumentTemplatesSearchParams };

export default class DocumentTemplatesController extends BaseController<
    DocumentTemplate,
    DocumentTemplateRepository
> {
    private static instance: DocumentTemplatesController;

    constructor() {
        super(new DocumentTemplateRepository());
    }

    private static getInstance(): DocumentTemplatesController {
        if (!this.instance) {
            this.instance = new DocumentTemplatesController();
        }
        return this.instance;
    }

    static async find(
        searchParams: DocumentTemplatesSearchParams[] = []
    ): Promise<DocumentTemplate[]> {
        const instance = this.getInstance();
        return instance.repository.find(searchParams);
    }

    static async addNewTemplate(
        templateData: DocumentTemplateData,
        userData: UserData
    ): Promise<DocumentTemplate> {
        const instance = this.getInstance();
        const _editor = await PersonsController.getPersonFromSessionUserData(
            userData
        );
        const item = new DocumentTemplate({ ...templateData, _editor } as any);

        await instance.create(item);

        console.log(`DocumentTemplate ${item.name} added`);
        return item;
    }

    static async updateTemplate(
        templateData: DocumentTemplateData,
        userData: UserData,
        fieldsToUpdate: string[]
    ): Promise<DocumentTemplate> {
        const instance = this.getInstance();
        const _editor = await PersonsController.getPersonFromSessionUserData(
            userData
        );
        const item = new DocumentTemplate({ ...templateData, _editor } as any);

        await instance.edit(item, undefined, undefined, fieldsToUpdate);

        console.log(`DocumentTemplate ${item.name} updated`);
        return item;
    }

    static async deleteTemplate(
        templateData: DocumentTemplateData
    ): Promise<{ id: number | undefined }> {
        const instance = this.getInstance();
        const item = new DocumentTemplate(templateData);

        await instance.delete(item);

        console.log(`DocumentTemplate with id ${item.id} deleted`);
        return { id: item.id };
    }
}
