import ToolsDb from '../../tools/ToolsDb';
import {
    PersonProfileEducationV2Payload,
    PersonProfileEducationV2Record,
} from '../../types/types';
import PersonProfileEducation from './PersonProfileEducation';
import EducationRepository from './EducationRepository';
import BaseController from '../../controllers/BaseController';

export default class EducationController extends BaseController<
    PersonProfileEducation,
    EducationRepository
> {
    private static instance: EducationController;

    constructor() {
        super(new EducationRepository());
    }

    private static getInstance(): EducationController {
        if (!this.instance) {
            this.instance = new EducationController();
        }
        return this.instance;
    }

    static async find(
        personId: number,
    ): Promise<PersonProfileEducation[]> {
        const instance = this.getInstance();
        return instance.repository.find(personId);
    }

    static async addFromDto(
        personId: number,
        educationData: PersonProfileEducationV2Payload,
    ): Promise<PersonProfileEducationV2Record> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.addEducationInDb(
                personId,
                educationData,
                conn,
            );
        });
    }

    static async editFromDto(
        personId: number,
        educationId: number,
        educationData: PersonProfileEducationV2Payload,
    ): Promise<PersonProfileEducationV2Record> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.editEducationInDb(
                personId,
                educationId,
                educationData,
                conn,
            );
        });
    }

    static async deleteFromDto(
        personId: number,
        educationId: number,
    ): Promise<{ id: number }> {
        const instance = this.getInstance();
        await ToolsDb.transaction(async (conn) => {
            await instance.repository.deleteEducationFromDb(
                personId,
                educationId,
                conn,
            );
        });
        return { id: educationId };
    }
}
