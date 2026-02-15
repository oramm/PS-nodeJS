import ToolsDb from '../../tools/ToolsDb';
import { SkillDictionaryPayload, SkillDictionaryRecord } from '../../types/types';
import SkillsDictionaryRepository from './SkillsDictionaryRepository';
import BaseController from '../../controllers/BaseController';

export default class SkillsDictionaryController extends BaseController<
    SkillDictionaryRecord,
    SkillsDictionaryRepository
> {
    private static instance: SkillsDictionaryController;

    constructor() {
        super(new SkillsDictionaryRepository());
    }

    private static getInstance(): SkillsDictionaryController {
        if (!this.instance) {
            this.instance = new SkillsDictionaryController();
        }
        return this.instance;
    }

    static async find(
        searchParams?: { searchText?: string },
    ): Promise<SkillDictionaryRecord[]> {
        const instance = this.getInstance();
        return instance.repository.find(searchParams);
    }

    static async addFromDto(
        payload: SkillDictionaryPayload,
    ): Promise<SkillDictionaryRecord> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.addSkillInDb(payload, conn);
        });
    }

    static async editFromDto(
        skillId: number,
        payload: SkillDictionaryPayload,
    ): Promise<SkillDictionaryRecord> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            return instance.repository.editSkillInDb(skillId, payload, conn);
        });
    }

    static async delete(skillId: number): Promise<{ id: number }> {
        const instance = this.getInstance();
        await ToolsDb.transaction(async (conn) => {
            await instance.repository.deleteSkillFromDb(skillId, conn);
        });
        return { id: skillId };
    }
}
