import ToolsDb from '../../tools/ToolsDb';
import {
    PersonProfileSkillV2Payload,
    PersonProfileSkillV2Record,
} from '../../types/types';
import PersonProfileSkill from './PersonProfileSkill';
import ProfileSkillRepository from './ProfileSkillRepository';
import BaseController from '../../controllers/BaseController';

export default class ProfileSkillController extends BaseController<
    PersonProfileSkill,
    ProfileSkillRepository
> {
    private static instance: ProfileSkillController;

    constructor() {
        super(new ProfileSkillRepository());
    }

    private static getInstance(): ProfileSkillController {
        if (!this.instance) {
            this.instance = new ProfileSkillController();
        }
        return this.instance;
    }

    static async find(
        personId: number,
    ): Promise<PersonProfileSkill[]> {
        const instance = this.getInstance();
        return instance.repository.find(personId);
    }

    static async addFromDto(
        personId: number,
        skillData: PersonProfileSkillV2Payload,
    ): Promise<PersonProfileSkillV2Record> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.addSkillInDb(
                personId,
                skillData,
                conn,
            );
        });
    }

    static async editFromDto(
        personId: number,
        skillEntryId: number,
        skillData: PersonProfileSkillV2Payload,
    ): Promise<PersonProfileSkillV2Record> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.editSkillInDb(
                personId,
                skillEntryId,
                skillData,
                conn,
            );
        });
    }

    static async deleteFromDto(
        personId: number,
        skillEntryId: number,
    ): Promise<{ id: number }> {
        const instance = this.getInstance();
        await ToolsDb.transaction(async (conn) => {
            await instance.repository.deleteSkillFromDb(
                personId,
                skillEntryId,
                conn,
            );
        });
        return { id: skillEntryId };
    }
}
