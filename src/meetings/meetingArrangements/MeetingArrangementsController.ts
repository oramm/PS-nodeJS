import Sharing from '../../contracts/milestones/sharing/MilestoneSharingController';
import ConsolidationGuard from '../../contracts/milestones/consolidation/ConsolidationWriteGuardController';
import mysql from 'mysql2/promise';
import { ProjectScope } from '../../types/sessionTypes';
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
        scope?: ProjectScope,
    ): Promise<MeetingArrangement[]> {
        const instance = this.getInstance();
        return await instance.repository.find(params, scope);
    }

    static async findFromDto(
        payload: {
            orConditions?: MeetingArrangementSearchParams[];
        },
        scope?: ProjectScope,
    ): Promise<MeetingArrangement[]> {
        const normalized =
            MeetingArrangementValidator.validateFindPayload(payload);
        if (normalized.orConditions.length === 0) {
            return [];
        }
        const results: MeetingArrangement[] = [];
        for (const condition of normalized.orConditions) {
            const items = await this.find(condition, scope);
            results.push(...items);
        }
        return [...new Map(results.map(item => [item.id, item])).values()];
    }

    static async addFromDto(
        payload: MeetingArrangementCreatePayload,
    ): Promise<MeetingArrangement> {
        // UI sends _case object; extract caseId and derive name from case label
        const uiCase = (payload as any)._case;
        if (!payload.caseId && uiCase?.id) {
            payload.caseId = uiCase.id;
        }
        if (!payload.name && uiCase) {
            payload.name =
                uiCase._typeFolderNumber_TypeName_Number_Name ||
                uiCase._folderName ||
                uiCase.name ||
                '';
        }
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
        return this.add(item);
    }

    static async editFromDto(
        payload: Partial<MeetingArrangementCreatePayload> & { id: number },
    ): Promise<MeetingArrangement> {
        if (!payload.caseId && (payload as any)._case?.id) {
            payload.caseId = (payload as any)._case.id;
        }
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
        return this.edit(item);
    }

    static async updateStatus(
        id: number,
        newStatus: MeetingArrangementStatus,
    ): Promise<MeetingArrangement> {
        return this.withCurrent(id, async current => {
            return ConsolidationGuard.cases([], [current.caseId], async () => {
                MeetingArrangementValidator.validateStatusTransition(current.status, newStatus);
                current.status = newStatus;
                await this.getInstance().repository.editInDb(current, undefined, false, ['status']);
                return current;
            });
        });
    }

    static async deleteById(id: number): Promise<void> {
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('id must be a positive integer');
        }
        await this.delete(new MeetingArrangement({ id }));
    }

    static async add(
        item: MeetingArrangement,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
    ): Promise<MeetingArrangement> {
        MeetingArrangementValidator.validateWriteContext(externalConn, isPartOfTransaction);
        return ConsolidationGuard.cases([], [item.caseId], async () => {
            await this.getInstance().repository.addInDb(item);
            return item;
        });
    }

    static async edit(
        item: MeetingArrangement,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
        fieldsToUpdate?: string[],
    ): Promise<MeetingArrangement> {
        MeetingArrangementValidator.validateWriteContext(externalConn, isPartOfTransaction);
        return this.withCurrent(item.id, async current => {
            const caseIds = [current.caseId];
            if (item.caseId !== undefined && (!fieldsToUpdate || fieldsToUpdate.includes('caseId'))) {
                caseIds.push(item.caseId);
            }
            return ConsolidationGuard.cases([], caseIds, async () => {
                await this.getInstance().repository.editInDb(item, undefined, false, fieldsToUpdate);
                return item;
            });
        });
    }

    static async delete(
        item: MeetingArrangement,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean,
    ): Promise<void> {
        MeetingArrangementValidator.validateWriteContext(externalConn, isPartOfTransaction);
        await this.withCurrent(item.id, current =>
            ConsolidationGuard.cases([], [current.caseId], () => this.getInstance().repository.deleteFromDb(item)),
        );
    }

    private static async withCurrent<T>(id: unknown, action: (current: MeetingArrangement) => Promise<T>): Promise<T> {
        MeetingArrangementValidator.validateId(id);
        return Sharing.runExclusive(async () => {
            const [current] = await this.getInstance().repository.find({ id });
            if (!current) throw new Error(`MeetingArrangement with id=${id} not found`);
            return action(current);
        });
    }
}
