import MeetingRepository, { MeetingSearchParams } from './MeetingRepository';
import Meeting from './Meeting';
import MeetingValidator from './MeetingValidator';
import BaseController from '../controllers/BaseController';
import { MeetingCreatePayload } from '../types/types';

export default class MeetingsController extends BaseController<
    Meeting,
    MeetingRepository
> {
    private static instance: MeetingsController;

    constructor() {
        super(new MeetingRepository());
    }

    private static getInstance(): MeetingsController {
        if (!this.instance) {
            this.instance = new MeetingsController();
        }
        return this.instance;
    }

    static async find(
        orConditions: MeetingSearchParams[] = [],
    ): Promise<Meeting[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    static async findFromDto(payload: {
        orConditions?: MeetingSearchParams[];
    }): Promise<Meeting[]> {
        const normalized = MeetingValidator.validateFindPayload(payload);
        return await this.find(normalized.orConditions);
    }

    static async addFromDto(
        payload: MeetingCreatePayload,
    ): Promise<Meeting> {
        const instance = this.getInstance();
        const validated = MeetingValidator.validateCreatePayload(payload);
        const meeting = new Meeting({
            name: validated.name,
            description: validated.description ?? '',
            date: validated.date ?? undefined,
            location: validated.location ?? '',
            _contract: { id: validated.contractId },
        });
        await instance.repository.addInDb(meeting);
        return meeting;
    }

    static async editFromDto(
        payload: Partial<MeetingCreatePayload> & { id: number },
    ): Promise<Meeting> {
        const instance = this.getInstance();
        const validated = MeetingValidator.validateEditPayload(payload);
        const meeting = new Meeting({
            id: validated.id,
            name: validated.name ?? '',
            description: (validated as any).description ?? '',
            date: validated.date ?? undefined,
            location: validated.location ?? '',
        });
        await instance.repository.editInDb(meeting);
        return meeting;
    }

    static async deleteById(id: number): Promise<void> {
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('id must be a positive integer');
        }
        const instance = this.getInstance();
        const meeting = new Meeting({ id, name: '', description: '' });
        await instance.repository.deleteFromDb(meeting);
    }
}
