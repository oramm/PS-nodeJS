import { ConsolidationMappingError } from './ConsolidationMappingValidator';
import type { PreviewScope } from './ConsolidationPreview';

const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const hash = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const id = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const object = (value: any, keys: string[]) => value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));

export default class ConsolidationPreviewValidator {
    static scope(scope: PreviewScope, projectOurId: string) {
        if (!object(scope, ['actorId', 'projectOurId', 'participantContractIds']) || !id(scope.actorId) ||
            typeof scope.projectOurId !== 'string' || !scope.projectOurId || scope.projectOurId !== projectOurId ||
            !Array.isArray(scope.participantContractIds) || !scope.participantContractIds.length || !scope.participantContractIds.every(id))
            throw new ConsolidationMappingError('INVALID_SNAPSHOT');
    }

    static envelope(value: any) {
        if (!object(value, ['previewId', 'content', 'revision', 'units', 'integrity']) || !uuid(value.previewId) ||
            !hash(value.revision) || !hash(value.integrity) || !Array.isArray(value.units) ||
            !object(value.content, ['formatVersion', 'scope', 'request', 'snapshot', 'analysis']) || value.content.formatVersion !== 1 ||
            !value.content.snapshot || !value.content.analysis ||
            value.units.some((u: any) => !object(u, ['unitKey', 'unitId']) || typeof u.unitKey !== 'string' || !uuid(u.unitId)) ||
            new Set(value.units.map((u: any) => u.unitId)).size !== value.units.length)
            throw new ConsolidationMappingError('INVALID_SNAPSHOT');
    }
}
