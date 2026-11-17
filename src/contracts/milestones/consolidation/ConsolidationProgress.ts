import type { OperationState } from './ConsolidationOperation';
import Preview, { canonical } from './ConsolidationPreview';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

/** Read projection only. Apply independently validates the persisted preview under its write locks. */
export default class ConsolidationProgress {
    static preview(preview: ReturnType<typeof Preview.create>, operation?: OperationState) {
        const ids = new Map(preview.units.map(u => [u.unitKey, u.unitId]));
        const units = preview.content.analysis.units.map(u => ({ ...u, unitId: ids.get(u.unitKey)! }));
        if (!operation) return { units, movedUnits: [], progress: null };
        const movedCases = new Set(operation.caseMappings.map(m => m.sourceCaseId));
        for (const mapping of operation.caseMappings) {
            const rows = preview.content.snapshot.rows.Cases;
            if (!rows.some(r => Number(r.Id) === mapping.sourceCaseId && Number(r.MilestoneId) === operation.sourceMilestoneId) ||
                !rows.some(r => Number(r.Id) === mapping.destinationCaseId && Number(r.MilestoneId) === operation.destinationMilestoneId))
                throw new Error('DEPENDENCY_CONFLICT', 409);
        }
        for (const table of ['Tasks', 'ProcessInstances', 'Risks', 'Securities', 'MeetingArrangements', 'Letters_Cases'])
            if ((preview.content.snapshot.rows[table] || []).some(r => movedCases.has(Number(r.CaseId))))
                throw new Error('DEPENDENCY_CONFLICT', 409);
        const pending = units.filter(u => {
            const moved = u.sourceCaseIds.filter(id => movedCases.has(id)).length;
            if (moved && moved !== u.sourceCaseIds.length) throw new Error('DEPENDENCY_CONFLICT', 409);
            return u.sourceCaseIds.length ? moved === 0 : !operation.units.some(old => old.unitKey === u.unitKey && old.moved);
        });
        if (canonical(pending.map(u => u.unitKey).sort()) !==
            canonical(operation.units.filter(u => !u.moved).map(u => u.unitKey).sort()))
            throw new Error('DEPENDENCY_CONFLICT', 409);
        const movedUnits = operation.units.filter(u => u.moved).map(u => ({ ...u, state: 'MOVED' as const }));
        return { units: pending, movedUnits,
            progress: { operationId: operation.operationId, moved: movedUnits.length, pending: pending.length,
                blocked: pending.filter(u => u.state === 'BLOCKED').length } };
    }
}
