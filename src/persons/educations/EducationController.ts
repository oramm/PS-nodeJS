import ToolsDb from '../../tools/ToolsDb';
import {
    PersonProfileEducationV2Payload,
    PersonProfileEducationV2Record,
} from '../../types/types';
import { AiEducation } from '../../tools/ToolsAI';
import PersonProfileEducation from './PersonProfileEducation';
import EducationRepository, {
    EducationSearchParams,
} from './EducationRepository';
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
        orConditions: EducationSearchParams[] = [],
    ): Promise<PersonProfileEducation[]> {
        const instance = this.getInstance();
        return instance.repository.find(personId, orConditions);
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

    static async importFromDto(
        personId: number,
        items: AiEducation[],
    ): Promise<{
        added: PersonProfileEducationV2Record[];
        skipped: AiEducation[];
        warnings: string[];
    }> {
        const instance = this.getInstance();
        const added: PersonProfileEducationV2Record[] = [];
        const skipped: AiEducation[] = [];
        const warnings: string[] = [];

        await ToolsDb.transaction(async (conn) => {
            for (const item of items) {
                if (item.schoolName || item.dateFrom) {
                    const duplicate = await instance.repository.findBySchoolAndDate(
                        personId,
                        item.schoolName ?? '',
                        item.dateFrom,
                        conn,
                    );
                    console.log('[educations import] findBySchoolAndDate result:', duplicate, 'for:', item.schoolName, item.dateFrom);
                    if (duplicate) {
                        skipped.push(item);
                        continue;
                    }
                }
                if (!item.dateFrom) {
                    warnings.push(
                        `Brak daty: ${item.schoolName ?? item.degreeName ?? '?'}`,
                    );
                }
                const record = await instance.repository.addEducationInDb(
                    personId,
                    item,
                    conn,
                );
                added.push(record);
            }
        });

        return { added, skipped, warnings };
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
