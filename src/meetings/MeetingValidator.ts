import { MeetingCreatePayload, MeetingSearchParams } from '../types/types';

export default class MeetingValidator {
    static validateFindPayload(payload: {
        orConditions?: MeetingSearchParams[];
    }): { orConditions: MeetingSearchParams[] } {
        if (!payload || typeof payload !== 'object') {
            return { orConditions: [] };
        }
        const orConditions = Array.isArray(payload.orConditions)
            ? payload.orConditions
            : [];
        return { orConditions };
    }

    static validateCreatePayload(
        payload: MeetingCreatePayload,
    ): MeetingCreatePayload {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Payload is required');
        }
        if (!Number.isInteger(payload.contractId) || payload.contractId <= 0) {
            throw new Error('contractId must be a positive integer');
        }
        if (typeof payload.name !== 'string' || !payload.name.trim()) {
            throw new Error('name is required');
        }
        return {
            ...payload,
            name: payload.name.trim(),
            description: payload.description?.trim() || null,
            date: payload.date ?? null,
            location: payload.location?.trim() || null,
        };
    }

    static validateEditPayload(
        payload: Partial<MeetingCreatePayload> & { id: number },
    ): Partial<MeetingCreatePayload> & { id: number } {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Payload is required');
        }
        if (!Number.isInteger(payload.id) || payload.id <= 0) {
            throw new Error('id must be a positive integer');
        }
        if (
            payload.name !== undefined &&
            (typeof payload.name !== 'string' || !payload.name.trim())
        ) {
            throw new Error('name cannot be empty');
        }
        return payload;
    }
}
