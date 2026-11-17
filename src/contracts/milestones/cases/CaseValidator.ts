import Setup from '../../../setup/Setup';
import type Case from './Case';

export default class CaseValidator {
    static selectedParents(dto: any, fields?: string[]) {
        return {
            milestoneId: !fields || fields.includes('milestoneId') ? dto._parent?.id : undefined,
            parentCaseId: !fields || fields.includes('parentCaseId') ? dto.parentCaseId || undefined : undefined,
        };
    }

    static id(id: unknown) {
        if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
            throw Object.assign(new Error('Nieprawidłowe ID sprawy.'), {status: 400});
    }

    static status(status: unknown) {
        if (status !== undefined && (typeof status !== 'string' || !Object.values(Setup.CaseStatus).includes(status)))
            throw Object.assign(new Error('Nieprawidłowy status sprawy.'), {status: 400});
    }

    static sharedParent(item: Case, stored: Case, shared: boolean, fields?: string[]) {
        if (shared && ((!fields || fields.includes('milestoneId')) && item.milestoneId !== undefined && item.milestoneId !== stored.milestoneId ||
            (!fields || fields.includes('parentCaseId')) && item.parentCaseId !== undefined && item.parentCaseId !== stored.parentCaseId))
            throw Object.assign(new Error('Przenoszenie wspólnej sprawy wymaga osobnej operacji.'), {status: 400});
    }

    static parent(item: Case, parent: Case | undefined) {
        if (!parent || parent.milestoneId !== item.milestoneId || parent.id === item.id)
            throw Object.assign(new Error('Sprawa nadrzędna musi należeć do tego samego kamienia.'), {status: 400});
    }
}
