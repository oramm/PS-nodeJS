import { createHash } from 'crypto';
import Batch from './ConsolidationBatch';
import Preview, { canonical } from './ConsolidationPreview';
import Context from './ConsolidationNoteValidator';
import Validator from './ConsolidationAuditValidator';
import type { EffectsSnapshot } from './ConsolidationEffectsRepository';

/** Evidence value only, never permission to execute. Caller supplies the fresh post-write read in its transaction. */
export default class ConsolidationAudit {
    static create(serializedPreview: string, input: unknown, operation: string, actor: number, after: EffectsSnapshot) {
        const { operationId, actorId } = Context.context(operation, actor);
        const before = Preview.restore(serializedPreview);
        const plan = Batch.prepare(serializedPreview, input);
        Validator.after(before.content.snapshot, after);
        const snapshotJSON = canonical({ version: 1, operationId, actorId, before, plan, after });
        return {
            operationId, actorId, requestId: plan.request.requestId, previewId: before.previewId,
            projectOurId: before.content.scope.projectOurId, sourceMilestoneId: plan.sourceMilestoneId,
            destinationMilestoneId: plan.destinationMilestoneId, beforeRevision: before.revision,
            contentHash: createHash('sha256').update(snapshotJSON).digest('hex'), snapshotJSON,
        };
    }
}
export type BatchAudit = ReturnType<typeof ConsolidationAudit.create>;
