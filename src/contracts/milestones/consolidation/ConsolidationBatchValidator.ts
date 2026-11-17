import { ConsolidationMappingError } from './ConsolidationMappingValidator';

export type BatchRequest = { requestId: string; previewId: string; expectedRevision: string; unitIds: string[] };
const uuid = (value: unknown): value is string => typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export default class ConsolidationBatchValidator {
    static request(value: unknown): BatchRequest {
        const body = value as BatchRequest;
        const keys = ['requestId', 'previewId', 'expectedRevision', 'unitIds'];
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== keys.length ||
            !keys.every(key => Object.prototype.hasOwnProperty.call(body, key)) || !uuid(body.requestId) || !uuid(body.previewId) ||
            typeof body.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedRevision) ||
            !Array.isArray(body.unitIds) || !body.unitIds.length ||
            Array.from(body.unitIds).some(id => !uuid(id))) throw new ConsolidationMappingError('INVALID_REQUEST');
        const unitIds = body.unitIds.map(id => id.toLowerCase());
        if (new Set(unitIds).size !== unitIds.length) throw new ConsolidationMappingError('INVALID_REQUEST');
        return { requestId: body.requestId.toLowerCase(), previewId: body.previewId.toLowerCase(),
            expectedRevision: body.expectedRevision, unitIds: unitIds.sort() };
    }
}
