import { ConsolidationMappingError } from './ConsolidationMappingValidator';

export default class ConsolidationNoteValidator {
    static id(value: unknown): number {
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > 2147483647)
            throw new ConsolidationMappingError('INVALID_SNAPSHOT');
        return value;
    }
    static context(operationId: unknown, actorId: unknown) {
        if (typeof operationId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(operationId))
            throw new ConsolidationMappingError('INVALID_REQUEST');
        return { operationId: operationId.toLowerCase(), actorId: this.id(actorId) };
    }
    static body(value: unknown): string | null {
        if (value === undefined || value === null) return null;
        if (typeof value !== 'string') throw new ConsolidationMappingError('INVALID_SNAPSHOT');
        return value;
    }
}
