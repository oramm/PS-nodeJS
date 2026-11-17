import SharingError from './MilestoneSharingError';
import MilestoneSharingValidator from './MilestoneSharingValidator';
import { createHash } from 'crypto';

export type NewContractSharedMilestone = {
    mode: 'shared';
    milestoneTypeId: 5;
    milestoneId: number;
    expectedRevision: string;
};

/** The old own-selection shape remains valid; a shared instruction must never fall back to it. */
export default class ContractCreationSharingValidator {
    static requestId(value: unknown): string {
        if (typeof value !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
            throw new SharingError('INVALID_REQUEST', 400);
        return value.toLowerCase();
    }

    static fingerprint(value: unknown): string {
        const normalize = (item: any): any => Array.isArray(item) ? item.map(normalize)
            : item && typeof item === 'object' ? Object.fromEntries(
                Object.keys(item).sort().map(key => [key, normalize(item[key])])) : item;
        return createHash('sha256').update(JSON.stringify(normalize(value))).digest('hex');
    }

    static parse(raw: unknown): NewContractSharedMilestone | undefined {
        if (raw == null) return undefined;
        if (!Array.isArray(raw)) {
            if (typeof raw === 'object' && ('mode' in raw || 'milestoneId' in raw))
                throw new SharingError('INVALID_REQUEST', 400);
            return undefined;
        }

        const shared = raw.filter(item => item?.mode === 'shared' || item?.milestoneId != null || item?.expectedRevision != null);
        if (raw.some(item => item?.mode != null && item.mode !== 'own' && item.mode !== 'shared') || shared.length > 1)
            throw new SharingError('INVALID_REQUEST', 400);
        if (!shared.length) return undefined;

        const item = shared[0];
        if (!item || item.mode !== 'shared' ||
            Object.keys(item).some(key => !['mode', 'milestoneTypeId', 'milestoneId', 'expectedRevision'].includes(key)) ||
            MilestoneSharingValidator.id(item.milestoneTypeId) !== 5 ||
            typeof item.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(item.expectedRevision) ||
            raw.some(other => other !== item && Number(other?.milestoneTypeId) === 5))
            throw new SharingError('INVALID_REQUEST', 400);

        for (const other of raw) {
            if (other === item) continue;
            if (!other || typeof other !== 'object' || Array.isArray(other) ||
                (other.mode != null && other.mode !== 'own') ||
                Object.keys(other).some(key => !['mode', 'milestoneTypeId', 'caseTypeIds'].includes(key)) ||
                !Array.isArray(other.caseTypeIds) ||
                other.caseTypeIds.some((id: unknown) => {
                    try { MilestoneSharingValidator.id(id); return false; }
                    catch { return true; }
                })) throw new SharingError('INVALID_REQUEST', 400);
            MilestoneSharingValidator.id(other.milestoneTypeId);
        }

        return { mode: 'shared', milestoneTypeId: 5,
            milestoneId: MilestoneSharingValidator.id(item.milestoneId),
            expectedRevision: item.expectedRevision };
    }
}
