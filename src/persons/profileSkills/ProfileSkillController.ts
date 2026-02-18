import ToolsDb from '../../tools/ToolsDb';
import {
    PersonProfileSkillV2Payload,
    PersonProfileSkillV2Record,
    SkillDictionaryRecord,
} from '../../types/types';
import SkillsDictionaryRepository from '../skills/SkillsDictionaryRepository';
import PersonProfileSkill from './PersonProfileSkill';
import ProfileSkillRepository, {
    ProfileSkillSearchParams,
} from './ProfileSkillRepository';
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
        orConditions: ProfileSkillSearchParams[] = [],
    ): Promise<PersonProfileSkill[]> {
        const instance = this.getInstance();
        return instance.repository.find(personId, orConditions);
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

    static async importFromDto(
        personId: number,
        items: Array<{ skillName?: string; name?: string; levelCode?: string; yearsOfExperience?: number }>,
    ): Promise<{
        added: PersonProfileSkillV2Record[];
        skipped: Array<{ skillName?: string; name?: string; levelCode?: string; yearsOfExperience?: number }>;
        newDictionaryEntries: SkillDictionaryRecord[];
    }> {
        const instance = this.getInstance();
        const dictRepo = new SkillsDictionaryRepository();

        const added: PersonProfileSkillV2Record[] = [];
        const skipped: Array<{
            skillName?: string;
            name?: string;
            levelCode?: string;
            yearsOfExperience?: number;
        }> = [];
        const newDictionaryEntries: SkillDictionaryRecord[] = [];

        const existingSkills = await instance.repository.find(personId);
        const existingSkillIds = new Set(existingSkills.map((s) => s.skillId));
        const dictionaryCache = new Map<string, SkillDictionaryRecord>();

        await ToolsDb.transaction(async (conn) => {
            for (const item of items) {
                const skillName = (item as any).skillName ?? (item as any).name;
                const normalized = SkillsDictionaryRepository.normalizeName(skillName);
                let skillEntry: SkillDictionaryRecord | undefined =
                    dictionaryCache.get(normalized) ??
                    (await dictRepo.findByNormalizedName(skillName));

                if (!skillEntry) {
                    skillEntry = await dictRepo.addSkillInDb(
                        { name: skillName },
                        conn,
                    );
                    newDictionaryEntries.push(skillEntry);
                }

                dictionaryCache.set(normalized, skillEntry);

                if (existingSkillIds.has(skillEntry.id)) {
                    skipped.push(item);
                    continue;
                }

                const record = await instance.repository.addSkillInDb(
                    personId,
                    {
                        skillId: skillEntry.id,
                        levelCode: item.levelCode,
                        yearsOfExperience: item.yearsOfExperience,
                    },
                    conn,
                );
                added.push(record);
                existingSkillIds.add(skillEntry.id);
            }
        });

        return { added, skipped, newDictionaryEntries };
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
