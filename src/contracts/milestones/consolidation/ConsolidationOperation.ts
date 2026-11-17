import { createHash } from 'crypto';
import Preview, { canonical } from './ConsolidationPreview';
import Batch from './ConsolidationBatch';
import Context from './ConsolidationNoteValidator';
import Validator from './ConsolidationOperationValidator';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

export type OperationState = {
    version: 1; operationId: string; projectOurId: string; sourceMilestoneId: number; destinationMilestoneId: number;
    accountingContractId: number; actorId: number; participantContractIds: number[];
    state: 'TRANSFERRING' | 'FINALIZING' | 'RECONCILIATION_REQUIRED' | 'COMPLETED';
    finalization?: { actorId:number; requestId:string };
    completion?: { actorId: number; requestId: string; sourceFolderId: string; sourceDatabaseRemoved: true; sourceFolderTrashed: true; documentsReady: true };
    units: { unitKey: string; unitId: string; moved: boolean }[];
    caseMappings: { sourceCaseId: number; destinationCaseId: number }[];
    batches: { actorId: number; requestId: string; previewId: string }[];
};
const pack = (state: OperationState) => {
    const snapshotJSON = canonical(state);
    return { operationId: state.operationId, projectOurId: state.projectOurId, sourceMilestoneId: state.sourceMilestoneId,
        destinationMilestoneId: state.destinationMilestoneId, actorId: state.actorId, state: state.state,
        revision: createHash('sha256').update(snapshotJSON).digest('hex'), snapshotJSON };
};

/** Internal value for the DB transaction that commits a batch. Does not execute or authorize it. */
export default class ConsolidationOperation {
    static first(text: string, input: unknown, operation: string, actor: number) {
        const { operationId, actorId } = Context.context(operation, actor);
        const p = Preview.restore(text), batch = Batch.prepare(text, input);
        const selected = new Set(batch.selectedUnitIds);
        return pack({ version: 1, operationId, actorId, projectOurId: p.content.scope.projectOurId,
            sourceMilestoneId: batch.sourceMilestoneId, destinationMilestoneId: batch.destinationMilestoneId,
            accountingContractId: Context.id(batch.accountingContractId), participantContractIds: p.content.scope.participantContractIds,
            state: 'TRANSFERRING', units: p.units.map(u => ({ ...u, moved: selected.has(u.unitId) })),
            caseMappings: batch.caseMappings, batches: [{ actorId, requestId: batch.request.requestId, previewId: p.previewId }] });
    }
    static restore(record: OperationRecord): OperationState {
        Validator.record(record);
        return JSON.parse(record.snapshotJSON);
    }
    static transition(record: OperationRecord, state: OperationState['state'], completion?: OperationState['completion'], finalization?:OperationState['finalization']) {
        const value = this.restore(record);
        if (value.state === 'COMPLETED' || value.units.some(u=>!u.moved) || state === 'TRANSFERRING' ||
            (state === 'COMPLETED') !== Boolean(completion)) throw new Error('DEPENDENCY_CONFLICT',409);
        const next = pack({ ...value, state, ...(finalization?{finalization}:{}), ...(completion ? {completion} : {}) });
        Validator.record(next); return next;
    }
    static advance(record: OperationRecord, expectedRevision: string, text: string, input: unknown, actor: number) {
        if (record.revision !== expectedRevision) throw new Error('STALE_REVISION', 409);
        const state = this.restore(record), p = Preview.restore(text), batch = Batch.prepare(text, input);
        if (state.state !== 'TRANSFERRING') throw new Error('OPERATION_IN_PROGRESS',409);
        const actorId = Context.id(actor);
        if (batch.sourceMilestoneId !== state.sourceMilestoneId || batch.destinationMilestoneId !== state.destinationMilestoneId ||
            batch.accountingContractId !== state.accountingContractId || p.content.scope.projectOurId !== state.projectOurId)
            throw new Error('INVALID_MAPPING');
        // Transferred letter/process edges no longer group empty source cases. Keep the
        // original moved units; compare only pending groups and refuse mixed ownership.
        const movedCases = new Set(state.caseMappings.map(m => m.sourceCaseId));
        for (const mapping of state.caseMappings) {
            const source = p.content.snapshot.rows.Cases.find(c => Number(c.Id) === mapping.sourceCaseId);
            const destination = p.content.snapshot.rows.Cases.find(c => Number(c.Id) === mapping.destinationCaseId);
            if (!source || !destination || Number(source.MilestoneId) !== state.sourceMilestoneId ||
                Number(destination.MilestoneId) !== state.destinationMilestoneId)
                throw new Error('DEPENDENCY_CONFLICT', 409);
            const selected = p.content.request.mappings.find(m => m.sourceCaseId === mapping.sourceCaseId);
            if (!selected || selected.target.mode !== 'existing' || selected.target.caseId !== mapping.destinationCaseId)
                throw new Error('INVALID_MAPPING');
        }
        for (const table of ['Tasks', 'ProcessInstances', 'Risks', 'Securities', 'MeetingArrangements', 'Letters_Cases'])
            if ((p.content.snapshot.rows[table] || []).some(row => movedCases.has(Number(row.CaseId))))
                throw new Error('DEPENDENCY_CONFLICT', 409);
        const pending = p.content.analysis.units.filter(u => {
            const moved = u.sourceCaseIds.filter(id => movedCases.has(id)).length;
            if (moved && moved !== u.sourceCaseIds.length) throw new Error('DEPENDENCY_CONFLICT', 409);
            if (u.sourceCaseIds.length) return moved === 0;
            return !state.units.some(old => old.unitKey === u.unitKey && old.moved);
        });
        if (canonical(state.units.filter(u => !u.moved).map(u => u.unitKey).sort()) !==
            canonical(pending.map(u => u.unitKey).sort())) throw new Error('DEPENDENCY_CONFLICT', 409);
        const pendingKeys = new Set(pending.map(u => u.unitKey));
        if (p.units.some(u => batch.selectedUnitIds.includes(u.unitId) && !pendingKeys.has(u.unitKey)))
            throw new Error('IDEMPOTENCY_CONFLICT', 409);
        const selected = new Set(p.units.filter(u => batch.selectedUnitIds.includes(u.unitId)).map(u => u.unitKey));
        if (state.units.some(u => selected.has(u.unitKey) && u.moved) ||
            state.batches.some(b => b.actorId === actorId && b.requestId === batch.request.requestId))
            throw new Error('IDEMPOTENCY_CONFLICT', 409);
        for (const mapping of batch.caseMappings) {
            const old = state.caseMappings.find(m => m.sourceCaseId === mapping.sourceCaseId);
            if (old && old.destinationCaseId !== mapping.destinationCaseId) throw new Error('INVALID_MAPPING');
            if (!old) state.caseMappings.push(mapping);
        }
        state.units.forEach(u => { if (selected.has(u.unitKey)) u.moved = true; });
        state.participantContractIds = [...new Set([...state.participantContractIds, ...p.content.scope.participantContractIds])].sort((a,b) => a-b);
        state.batches.push({ actorId, requestId: batch.request.requestId, previewId: p.previewId });
        return pack(state);
    }
}
export type OperationRecord = ReturnType<typeof pack>;
