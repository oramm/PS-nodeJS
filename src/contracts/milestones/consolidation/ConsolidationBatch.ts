import { createHash } from 'crypto';
import Preview, { canonical } from './ConsolidationPreview';
import Validator from './ConsolidationBatchValidator';
import { ConsolidationMappingError } from './ConsolidationMappingValidator';

/** Internal plan only. The executor must authorize, lock and re-read before any write. */
export default class ConsolidationBatch {
    static prepare(serializedPreview: string, input: unknown) {
        const request = Validator.request(input);
        const preview = Preview.restore(serializedPreview);
        if (preview.previewId !== request.previewId || preview.revision !== request.expectedRevision)
            throw new ConsolidationMappingError('STALE_REVISION', 409);
        const { analysis, snapshot } = preview.content;
        const keys = new Map<string, string>(preview.units.map(u => [u.unitId, u.unitKey]));
        if (request.unitIds.some(id => !keys.has(id))) throw new ConsolidationMappingError('INVALID_REQUEST');
        const selectedKeys = new Set(request.unitIds.map(id => keys.get(id)!));
        const selected = analysis.units.filter(u => selectedKeys.has(u.unitKey));
        if (selected.some(u => u.state !== 'ANALYZED' || u.conflicts.length))
            throw new ConsolidationMappingError('DEPENDENCY_CONFLICT', 409);
        const caseIds = new Set(selected.flatMap(u => u.sourceCaseIds));
        const taskIds = new Set(selected.flatMap(u => u.taskIds));
        const targets = new Map<number, number>();
        for (const mapping of analysis.mappings.filter(m => caseIds.has(m.sourceCaseId))) {
            // A proposal is not explicit consent. New folders/cases need their own durable preparation step.
            if (mapping.state !== 'SELECTED' || mapping.target?.mode !== 'existing')
                throw new ConsolidationMappingError('INVALID_MAPPING');
            targets.set(mapping.sourceCaseId, mapping.target.caseId);
        }
        if (targets.size !== caseIds.size) throw new ConsolidationMappingError('INVALID_MAPPING');
        const rows = (table: string) => snapshot.rows[table] || [];
        const taskMoves = rows('Tasks').filter(row => caseIds.has(Number(row.CaseId))).map(row => ({
            taskId: Number(row.Id), sourceCaseId: Number(row.CaseId), destinationCaseId: targets.get(Number(row.CaseId))!,
            before: row,
        }));
        if (taskMoves.length !== taskIds.size || taskMoves.some(row => !taskIds.has(row.taskId)))
            throw new ConsolidationMappingError('DEPENDENCY_CONFLICT', 409);
        const referenceMoves = ['ProcessInstances', 'Risks', 'Securities', 'MeetingArrangements'].flatMap(table =>
            rows(table).filter(row => caseIds.has(Number(row.CaseId))).map(row => ({ table, id: Number(row.Id),
                sourceCaseId: Number(row.CaseId), destinationCaseId: targets.get(Number(row.CaseId))!, before: row })));
        const letterEdges = analysis.letterEdges.filter(edge => caseIds.has(edge.sourceCaseId)).map(edge => ({
            ...edge, destinationCaseId: targets.get(edge.sourceCaseId)!,
        }));
        const metadataSelected = selectedKeys.has(`milestone:${preview.content.request.sourceMilestoneId}`);
        const sourceSnapshots = analysis.notes.filter(note => note.entity === 'Cases'
            ? caseIds.has(note.sourceId) : metadataSelected);
        const destinationCaseIds = new Set(targets.values());
        const destinationSnapshots = rows('Cases').filter(row => destinationCaseIds.has(Number(row.Id)));
        const { requestId, ...payload } = request;
        return {
            stage: 'BATCH_PLAN_ONLY' as const, executable: false as const, request,
            payloadHash: createHash('sha256').update(canonical(payload)).digest('hex'),
            sourceMilestoneId: preview.content.request.sourceMilestoneId,
            destinationMilestoneId: preview.content.request.destinationMilestoneId,
            accountingContractId: analysis.accountingContractId,
            selectedUnitIds: request.unitIds,
            pendingUnitIds: preview.units.filter(u => !selectedKeys.has(u.unitKey)).map(u => u.unitId).sort(),
            caseMappings: [...targets].map(([sourceCaseId, destinationCaseId]) => ({ sourceCaseId, destinationCaseId })),
            taskMoves, referenceMoves, letterEdges, sourceSnapshots, destinationSnapshots,
            // Full immutable-by-copy input remains available for audit and comparison, including unchanged edges/JSON.
            snapshot,
        };
    }
}
