import Batch from './ConsolidationBatch';
import { canonical } from './ConsolidationPreview';
import Validator from './ConsolidationNoteValidator';
import { ConsolidationMappingError } from './ConsolidationMappingValidator';

export type TransferNote = {
    operationId: string; sourceEntity: 'Milestones' | 'Cases' | 'MilestoneDates'; sourceId: number;
    noteKind: 'SOURCE_SNAPSHOT'; destinationEntity: 'Milestones' | 'Cases'; destinationId: number;
    sourceContractId: number; actorId: number; body: string | null; snapshotJSON: string;
};

/** Pure note materialization. It does not authorize, execute or mark a batch moved. */
export default class ConsolidationNote {
    static create(serializedPreview: string, request: unknown, operationId: unknown, actorId: unknown): TransferNote[] {
        const context = Validator.context(operationId, actorId);
        const batch = Batch.prepare(serializedPreview, request);
        const targets = new Map(batch.caseMappings.map(m => [m.sourceCaseId, m.destinationCaseId]));
        return batch.sourceSnapshots.map(note => {
            if (!['Milestones', 'Cases', 'MilestoneDates'].includes(note.entity))
                throw new ConsolidationMappingError('INVALID_SNAPSHOT');
            const destinationEntity = note.entity === 'Cases' ? 'Cases' as const : 'Milestones' as const;
            const destinationId = note.entity === 'Cases' ? targets.get(note.sourceId) : batch.destinationMilestoneId;
            return { ...context, sourceEntity: note.entity as TransferNote['sourceEntity'], sourceId: Validator.id(note.sourceId),
                noteKind: 'SOURCE_SNAPSHOT' as const, destinationEntity, destinationId: Validator.id(destinationId),
                sourceContractId: Validator.id(note.sourceContractId), body: Validator.body(note.record.Description),
                snapshotJSON: canonical(note.record) };
        });
    }
}
