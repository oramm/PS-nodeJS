import type { MappingRequest } from './ConsolidationMapping';

export class ConsolidationMappingError extends Error {
    constructor(public code: string, public status = 400) {
        super(code);
        this.name = 'ConsolidationMappingError';
    }
}

export default class ConsolidationMappingValidator {
    static request(input: unknown): MappingRequest {
        const body = this.object(input);
        const operationId = body.operationId;
        this.keys(body, ['sourceMilestoneId', 'destinationMilestoneId', 'mappings', ...(operationId === undefined ? [] : ['operationId'])]);
        if (operationId !== undefined && (typeof operationId !== 'string' ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(operationId))) this.invalid();
        const sourceMilestoneId = this.id(body.sourceMilestoneId);
        const destinationMilestoneId = this.id(body.destinationMilestoneId);
        if (sourceMilestoneId === destinationMilestoneId)
            throw new ConsolidationMappingError('SELF_TRANSFER', 409);
        if (!Array.isArray(body.mappings)) this.invalid();
        const seen = new Set<number>();
        const mappings = (body.mappings as unknown[]).map(value => {
            const mapping = this.object(value);
            this.keys(mapping, ['sourceCaseId', 'target']);
            const sourceCaseId = this.id(mapping.sourceCaseId);
            if (seen.has(sourceCaseId)) this.invalid();
            seen.add(sourceCaseId);
            const target = this.object(mapping.target);
            if (target.mode === 'existing') {
                this.keys(target, ['mode', 'caseId']);
                return { sourceCaseId, target: { mode: 'existing' as const, caseId: this.id(target.caseId) } };
            }
            if (target.mode !== 'create') this.invalid();
            this.keys(target, ['mode', 'caseTypeId', 'name', 'parentSourceCaseId']);
            if (typeof target.name !== 'string') this.invalid();
            const parentSourceCaseId = target.parentSourceCaseId === null
                ? null : this.id(target.parentSourceCaseId);
            if (parentSourceCaseId === sourceCaseId) this.invalid();
            return { sourceCaseId, target: {
                mode: 'create' as const,
                caseTypeId: this.id(target.caseTypeId),
                name: target.name as string,
                parentSourceCaseId,
            } };
        });
        return { sourceMilestoneId, destinationMilestoneId, mappings,
            ...(operationId === undefined ? {} : { operationId: (operationId as string).toLowerCase() }) };
    }

    private static object(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            ![Object.prototype, null].includes(Object.getPrototypeOf(value))) this.invalid();
        return value as Record<string, unknown>;
    }

    private static keys(value: Record<string, unknown>, allowed: string[]) {
        if (Object.keys(value).length !== allowed.length ||
            allowed.some(key => !Object.prototype.hasOwnProperty.call(value, key))) this.invalid();
    }

    private static id(value: unknown): number {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 2147483647)
            this.invalid();
        return value as number;
    }

    private static invalid(): never { throw new ConsolidationMappingError('INVALID_MAPPING'); }
}
