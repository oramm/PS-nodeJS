import ToolsDb from '../../tools/ToolsDb';
import {
    PersonProfileExperienceV2Payload,
    PersonProfileExperienceV2Record,
} from '../../types/types';
import { AiExperience } from '../../tools/ToolsAI';
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

    static async importFromDto(
        personId: number,
        items: AiExperience[],
    ): Promise<{
        added: PersonProfileExperienceV2Record[];
        skipped: AiExperience[];
        warnings: string[];
    }> {
        const instance = this.getInstance();
        const added: PersonProfileExperienceV2Record[] = [];
        const skipped: AiExperience[] = [];
        const warnings: string[] = [];

        await ToolsDb.transaction(async (conn) => {
            for (const item of items) {
                if (item.dateFrom) {
                    const duplicate = await instance.repository.findByPeriod(
                        personId,
                        item.dateFrom,
                        item.dateTo,
                        conn,
                    );
                    console.log('[experiences import] findByPeriod result:', duplicate, 'for:', item.dateFrom, item.dateTo);
                    if (duplicate) {
                        skipped.push(item);
                        continue;
                    }
                } else {
                    warnings.push(
                        `Brak daty: ${item.organizationName ?? item.positionName ?? '?'}`,
                    );
                }
                const record = await instance.repository.addExperienceInDb(
                    personId,
                    item,
                    conn,
                );
                console.log('[experiences import] added record id:', record.id);
                added.push(record);
            }
        });

        return { added, skipped, warnings };
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
