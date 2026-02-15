import { ContractMeetingNoteCreatePayload } from '../types/types';
import { ContractMeetingNoteSearchParams } from './ContractMeetingNoteRepository';

export default class ContractMeetingNoteValidator {
    static validateFindPayload(payload: {
        orConditions?: ContractMeetingNoteSearchParams[];
    }): { orConditions: ContractMeetingNoteSearchParams[] } {
        if (!payload || typeof payload !== 'object') {
            return { orConditions: [] };
        }
        const orConditions = Array.isArray(payload.orConditions)
            ? payload.orConditions
            : [];

        return { orConditions };
    }

    static validateCreatePayload(
        payload: ContractMeetingNoteCreatePayload
    ): ContractMeetingNoteCreatePayload {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Payload is required');
        }
        if (!Number.isInteger(payload.contractId) || payload.contractId <= 0) {
            throw new Error('contractId must be a positive integer');
        }
        if (typeof payload.title !== 'string' || !payload.title.trim()) {
            throw new Error('title is required');
        }

        const normalizedPayload: ContractMeetingNoteCreatePayload = {
            ...payload,
            contractId: payload.contractId,
            title: payload.title.trim(),
            description:
                payload.description === undefined
                    ? null
                    : payload.description?.trim() || null,
            meetingDate: payload.meetingDate ?? null,
            protocolGdId: payload.protocolGdId ?? null,
            createdByPersonId: payload.createdByPersonId ?? null,
        };

        if (normalizedPayload.title.length > 255) {
            throw new Error('title is too long (max 255 chars)');
        }

        return normalizedPayload;
    }
}
