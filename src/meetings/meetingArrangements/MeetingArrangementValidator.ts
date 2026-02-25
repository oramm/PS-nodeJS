import {
    MeetingArrangementCreatePayload,
    MeetingArrangementSearchParams,
    MeetingArrangementStatus,
} from '../../types/types';

const VALID_STATUSES: MeetingArrangementStatus[] = [
    'PLANNED',
    'DISCUSSED',
    'CLOSED',
];
const STATUS_ORDER: Record<MeetingArrangementStatus, number> = {
    PLANNED: 0,
    DISCUSSED: 1,
    CLOSED: 2,
};

export default class MeetingArrangementValidator {
    static validateFindPayload(payload: {
        orConditions?: MeetingArrangementSearchParams[];
    }): { orConditions: MeetingArrangementSearchParams[] } {
        if (!payload || typeof payload !== 'object') {
            return { orConditions: [] };
        }
        const orConditions = Array.isArray(payload.orConditions)
            ? payload.orConditions
            : [];
        return { orConditions };
    }

    static validateCreatePayload(
        payload: MeetingArrangementCreatePayload,
    ): MeetingArrangementCreatePayload {
        if (!payload || typeof payload !== 'object') {
            throw new Error('Payload is required');
        }
        if (
            !Number.isInteger(payload.meetingId) ||
            payload.meetingId <= 0
        ) {
            throw new Error('meetingId must be a positive integer');
        }
        if (!Number.isInteger(payload.caseId) || payload.caseId <= 0) {
            throw new Error('caseId must be a positive integer');
        }
        return {
            ...payload,
            name: payload.name?.trim() || null,
            description: payload.description?.trim() || null,
            deadline: payload.deadline ?? null,
            ownerId: payload.ownerId ?? null,
        };
    }

    static validateStatusTransition(
        currentStatus: MeetingArrangementStatus,
        newStatus: MeetingArrangementStatus,
    ): void {
        if (!VALID_STATUSES.includes(newStatus)) {
            throw new Error(
                `Invalid status: ${newStatus}. Must be one of: ${VALID_STATUSES.join(', ')}`,
            );
        }
        if (STATUS_ORDER[newStatus] !== STATUS_ORDER[currentStatus] + 1) {
            throw new Error(
                `Cannot transition from ${currentStatus} to ${newStatus}. Status can only move one step forward: PLANNED -> DISCUSSED -> CLOSED`,
            );
        }
    }
}
