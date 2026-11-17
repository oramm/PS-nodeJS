import { createHash } from 'crypto';
import { canonical } from './ConsolidationPreview';
import Context from './ConsolidationNoteValidator';
import type { OperationRecord } from './ConsolidationOperation';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

export default class ConsolidationOperationValidator {
    static record(record: OperationRecord) {
        try {
            const s = JSON.parse(record.snapshotJSON);
            if (canonical(s) !== record.snapshotJSON || createHash('sha256').update(record.snapshotJSON).digest('hex') !== record.revision ||
                s.version !== 1 || !['TRANSFERRING','FINALIZING','RECONCILIATION_REQUIRED','COMPLETED'].includes(s.state) || !s.projectOurId ||
                ['operationId', 'projectOurId', 'sourceMilestoneId', 'destinationMilestoneId', 'actorId', 'state'].some(k => s[k] !== (record as any)[k]))
                throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
            Context.context(s.operationId, s.actorId);
            [s.sourceMilestoneId, s.destinationMilestoneId, s.accountingContractId, ...s.participantContractIds].forEach(Context.id);
            if (s.sourceMilestoneId === s.destinationMilestoneId || !s.participantContractIds.length ||
                !Array.isArray(s.units) || !s.units.length || !Array.isArray(s.batches) || !s.batches.length || !Array.isArray(s.caseMappings))
                throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
            for (const u of s.units) { Context.context(u.unitId, s.actorId); if (typeof u.unitKey !== 'string' || !u.unitKey || typeof u.moved !== 'boolean') throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409); }
            if (new Set(s.units.map((u: any) => u.unitKey)).size !== s.units.length || new Set(s.units.map((u: any) => u.unitId)).size !== s.units.length)
                throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
            for (const m of s.caseMappings) { Context.id(m.sourceCaseId); Context.id(m.destinationCaseId); }
            if (new Set(s.caseMappings.map((m: any) => m.sourceCaseId)).size !== s.caseMappings.length) throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
            if (s.state !== 'TRANSFERRING' && s.units.some((u: any)=>!u.moved)) throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            if(s.state!=='TRANSFERRING'){if(!s.finalization||Object.keys(s.finalization).sort().join(',')!=='actorId,requestId')throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);Context.context(s.finalization.requestId,s.finalization.actorId);}else if(s.finalization)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            if (s.state === 'COMPLETED') {
                const c = s.completion;
                if (!c || Object.keys(c).sort().join(',') !== 'actorId,documentsReady,requestId,sourceDatabaseRemoved,sourceFolderId,sourceFolderTrashed' ||
                    c.actorId!==s.finalization.actorId||c.requestId!==s.finalization.requestId||c.sourceDatabaseRemoved !== true || c.sourceFolderTrashed !== true || c.documentsReady !== true ||
                    typeof c.sourceFolderId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(c.sourceFolderId)) throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                Context.context(c.requestId,c.actorId);
            } else if (s.completion) throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            for (const b of s.batches) { Context.context(b.requestId, b.actorId); Context.context(b.previewId, b.actorId); }
        } catch { throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409); }
    }
}
