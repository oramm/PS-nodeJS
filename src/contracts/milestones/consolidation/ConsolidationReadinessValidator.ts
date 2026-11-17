import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
export default class ConsolidationReadinessValidator {
    static request(body: unknown) {
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype ||
            Object.keys(body).length) throw new Error('INVALID_REQUEST', 400);
    }
    static result(value: any) {
        const fail = () => { throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409); };
        const uuid = (id: unknown) => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
        if (!value || Object.keys(value).sort().join(',') !== 'blockers,checkId,destinationFolderId,operationId,ready,revision,sourceFolderId,sourceTree' ||
            !uuid(value.operationId) || !uuid(value.checkId) || typeof value.revision !== 'string' ||
            !/^[a-f0-9]{64}$/.test(value.revision) || typeof value.ready !== 'boolean' ||
            typeof value.sourceFolderId !== 'string' || typeof value.destinationFolderId !== 'string' ||
            !Array.isArray(value.blockers) || value.blockers.length > 50000 ||
            value.blockers.some((b: any) => !b || typeof b.code !== 'string' || !b.code || typeof b.reference !== 'string') ||
            !value.sourceTree || Object.keys(value.sourceTree).sort().join(',') !== 'complete,remaining' ||
            typeof value.sourceTree.complete !== 'boolean' || !Array.isArray(value.sourceTree.remaining) ||
            value.sourceTree.remaining.length > 10000 || value.sourceTree.remaining.some((r: any) => !r || typeof r.id !== 'string' || !r.id) ||
            new Set(value.sourceTree.remaining.map((r: any) => r.id)).size !== value.sourceTree.remaining.length) fail();
        const coherent = value.sourceTree.complete && value.sourceTree.remaining.length === 0 && value.blockers.length === 0 &&
            /^[A-Za-z0-9_-]+$/.test(value.sourceFolderId) && /^[A-Za-z0-9_-]+$/.test(value.destinationFolderId) &&
            value.sourceFolderId !== value.destinationFolderId;
        if (value.ready !== coherent) fail();
    }
}
