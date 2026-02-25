import mysql from 'mysql2/promise';
import MeetingArrangement from './MeetingArrangement';
import MeetingArrangementRepository, {
    MeetingArrangementSearchParams,
} from './MeetingArrangementRepository';
import MeetingArrangementValidator from './MeetingArrangementValidator';
import {
    MeetingArrangementCreatePayload,
    MeetingArrangementStatus,
} from '../../types/types';

export default class MeetingArrangementsController {
    private static _instance: MeetingArrangementsController;
    private repository: MeetingArrangementRepository;

    private constructor() {
        this.repository = new MeetingArrangementRepository();
    }

    static getInstance(): MeetingArrangementsController {
        if (!this._instance) {
            this._instance = new MeetingArrangementsController();
        }
        return this._instance;
    }

    static async find(
        params?: MeetingArrangementSearchParams,
    ): Promise<MeetingArrangement[]> {
        const instance = this.getInstance();
        return await instance.repository.find(params);
    }

    static async findFromDto(payload: {
        orConditions?: MeetingArrangementSearchParams[];
    }): Promise<MeetingArrangement[]> {
        const normalized =
            MeetingArrangementValidator.validateFindPayload(payload);
        if (normalized.orConditions.length === 0) {
            return [];
        }
        const results: MeetingArrangement[] = [];
        for (const condition of normalized.orConditions) {
            const items = await this.find(condition);
            results.push(...items);
        }
        return results;
    }

    static async addFromDto(
        payload: MeetingArrangementCreatePayload,
    ): Promise<MeetingArrangement> {
        const instance = this.getInstance();
        const validated =
            MeetingArrangementValidator.validateCreatePayload(payload);
        const item = new MeetingArrangement({
            name: validated.name ?? undefined,
            description: validated.description ?? undefined,
            deadline: validated.deadline,
            _parent: { id: validated.meetingId },
            _case: { id: validated.caseId },
            _owner: validated.ownerId
                ? { id: validated.ownerId }
                : undefined,
        });
        await instance.repository.addInDb(item);
        return item;
    }

    static async editFromDto(
        payload: Partial<MeetingArrangementCreatePayload> & { id: number },
    ): Promise<MeetingArrangement> {
        const instance = this.getInstance();
        if (!Number.isInteger(payload.id) || payload.id <= 0) {
            throw new Error('id must be a positive integer');
        }
        const item = new MeetingArrangement({
            id: payload.id,
            name: payload.name ?? undefined,
            description: payload.description ?? undefined,
            deadline: payload.deadline,
            _parent: payload.meetingId
                ? { id: payload.meetingId }
                : undefined,
            _case: payload.caseId ? { id: payload.caseId } : undefined,
            _owner: payload.ownerId
                ? { id: payload.ownerId }
                : undefined,
        });
        await instance.repository.editInDb(item);
        return item;
    }

    static async updateStatus(
        id: number,
        newStatus: MeetingArrangementStatus,
    ): Promise<MeetingArrangement> {
        const instance = this.getInstance();
        const items = await instance.repository.find({ id });
        if (items.length === 0) {
            throw new Error(`MeetingArrangement with id=${id} not found`);
        }
        const current = items[0];
        MeetingArrangementValidator.validateStatusTransition(
            current.status,
            newStatus,
        );
        current.status = newStatus;
        await instance.repository.editInDb(current, undefined, false, [
            'status',
        ]);
        return current;
    }

    static async deleteById(id: number): Promise<void> {
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('id must be a positive integer');
        }
        const instance = this.getInstance();
        const item = new MeetingArrangement({ id });
        item._dbTableName = 'MeetingArrangements';
        await instance.repository.deleteFromDb(item);
    }

    static async add(
        item: MeetingArrangement,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
    ): Promise<MeetingArrangement> {
        const instance = this.getInstance();
        await instance.repository.addInDb(
            item,
            externalConn,
            isPartOfTransaction,
        );
        return item;
    }

    static async edit(
        item: MeetingArrangement,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
        fieldsToUpdate?: string[],
    ): Promise<MeetingArrangement> {
        const instance = this.getInstance();
        await instance.repository.editInDb(
            item,
            externalConn,
            isPartOfTransaction,
            fieldsToUpdate,
        );
        return item;
    }

    static async delete(
        item: MeetingArrangement,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
    ): Promise<void> {
        const instance = this.getInstance();
        await instance.repository.deleteFromDb(
            item,
            externalConn,
            isPartOfTransaction,
        );
    }
}
