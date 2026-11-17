import { canonical } from './ConsolidationPreview';
import { ConsolidationMappingError } from './ConsolidationMappingValidator';

export default class ConsolidationAuditValidator {
    /** Completeness of supplied evidence only; the executor separately verifies actual effects. */
    static after(before: any, after: any) {
        canonical(after);
        if (!after || Array.isArray(after) || after.projectOurId !== before.projectOurId ||
            canonical(Object.keys(after).sort()) !== canonical(Object.keys(before).sort()) ||
            !after.rows || Array.isArray(after.rows) ||
            canonical(Object.keys(after.rows).sort()) !== canonical(Object.keys(before.rows).sort()) ||
            Object.values(after.rows).some(rows => !Array.isArray(rows)))
            throw new ConsolidationMappingError('INVALID_SNAPSHOT');
        for (const field of ['columns', 'foreignKeys', 'indexes', 'caseTriggers', 'nameWeights', 'folderReferences'])
            if (!Array.isArray(after[field])) throw new ConsolidationMappingError('INVALID_SNAPSHOT');
    }
}
