import ToolsDb from '../../tools/ToolsDb';
import {
    PersonProfileExperienceV2Payload,
    PersonProfileExperienceV2Record,
} from '../../types/types';
import PersonProfileExperience from './PersonProfileExperience';
import ExperienceRepository, {
    ExperienceSearchParams,
} from './ExperienceRepository';
import BaseController from '../../controllers/BaseController';

export default class ExperienceController extends BaseController<
    PersonProfileExperience,
    ExperienceRepository
> {
    private static instance: ExperienceController;

    constructor() {
        super(new ExperienceRepository());
    }

    private static getInstance(): ExperienceController {
        if (!this.instance) {
            this.instance = new ExperienceController();
        }
        return this.instance;
    }

    static async find(
        personId: number,
        orConditions: ExperienceSearchParams[] = [],
    ): Promise<PersonProfileExperience[]> {
        const instance = this.getInstance();
        return instance.repository.find(personId, orConditions);
    }

    static async addFromDto(
        personId: number,
        experienceData: PersonProfileExperienceV2Payload,
    ): Promise<PersonProfileExperienceV2Record> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.addExperienceInDb(
                personId,
                experienceData,
                conn,
            );
        });
    }

    static async editFromDto(
        personId: number,
        experienceId: number,
        experienceData: PersonProfileExperienceV2Payload,
    ): Promise<PersonProfileExperienceV2Record> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.editExperienceInDb(
                personId,
                experienceId,
                experienceData,
                conn,
            );
        });
    }

    static async deleteFromDto(
        personId: number,
        experienceId: number,
    ): Promise<{ id: number }> {
        const instance = this.getInstance();
        await ToolsDb.transaction(async (conn) => {
            await instance.repository.deleteExperienceFromDb(
                personId,
                experienceId,
                conn,
            );
        });
        return { id: experienceId };
    }
}
