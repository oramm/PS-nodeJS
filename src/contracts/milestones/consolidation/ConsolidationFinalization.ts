import { createHash } from 'crypto';
import { canonical } from './ConsolidationPreview';
import Access from './ConsolidationAccessValidator';
import Check from './ConsolidationReadinessCheck';
import Validator, { FinalizationIntent } from './ConsolidationFinalizationValidator';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
export type FinalizationStep = 'TRASH_INTENT' | 'TRASH_CONFIRMED' | 'RECONCILIATION_REQUIRED' | 'COMPLETED';
export type FinalizationJournal = { version: 1; operationId: string; actorId: number; intent: FinalizationIntent;
    sourceMilestoneId: number; sourceFolderId: string; destinationFolderId: string; rootParents: string[]; folders: { id: string; parentId: string | null }[];
    checkSnapshot: string; step: FinalizationStep; folderTrashed: boolean; events: { step: FinalizationStep; reason: string }[];
    receipt?: FinalizationAck };
export type FinalizationAck = { operationId: string; revision: string; requestId: string; checkId: string; checkedRevision: string;
    destinationMilestoneId: number; state: 'FINALIZING' | 'RECONCILIATION_REQUIRED' | 'COMPLETED';
    documentsReady: boolean; sourceDatabaseRemoved: boolean; sourceFolderTrashed: boolean };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
export default class ConsolidationFinalization {
    static pack(journal: FinalizationJournal) { const stateJSON = canonical(journal); return { stateJSON, revision: hash(stateJSON) }; }
    static restore(row: any): FinalizationJournal {
        try {
            const j = JSON.parse(row.StateJSON);
            if (canonical(j) !== row.StateJSON || hash(row.StateJSON) !== row.Revision || j.version !== 1 ||
                j.operationId !== row.OperationId || j.actorId !== row.ActorId || j.intent.requestId !== row.RequestId ||
                !Number.isSafeInteger(j.actorId) || j.actorId <= 0 || !Number.isSafeInteger(j.sourceMilestoneId) || j.sourceMilestoneId <= 0 ||
                !['TRASH_INTENT','TRASH_CONFIRMED','RECONCILIATION_REQUIRED','COMPLETED'].includes(j.step) || typeof j.folderTrashed !== 'boolean' ||
                !Array.isArray(j.events) || !j.events.length || j.events.some((e: any) => !['TRASH_INTENT','TRASH_CONFIRMED','RECONCILIATION_REQUIRED','COMPLETED'].includes(e.step) || typeof e.reason !== 'string') ||
                j.events[j.events.length-1].step !== j.step || !Array.isArray(j.folders) || !j.folders.length || j.folders.length > 10000 ||
                new Set(j.folders.map((f: any) => f.id)).size !== j.folders.length ||
                j.folders.some((f: any) => !/^[A-Za-z0-9_-]+$/.test(f.id) || f.parentId !== null && !/^[A-Za-z0-9_-]+$/.test(f.parentId)) ||
                !j.folders.some((f: any) => f.id === j.sourceFolderId && f.parentId === null) ||
                !/^[A-Za-z0-9_-]+$/.test(j.destinationFolderId) || j.destinationFolderId === j.sourceFolderId ||
                typeof j.checkSnapshot !== 'string' || !Array.isArray(j.rootParents) || !j.rootParents.length || j.rootParents.some((id:unknown)=>typeof id!=='string'||!id) || new Set(j.rootParents).size!==j.rootParents.length) throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            Access.uuid(j.operationId); Validator.request(j.intent);
            const saved = JSON.parse(j.checkSnapshot);
            const check = Check.restore({CheckId:saved.checkId,OperationId:saved.operationId,ActorId:saved.actorId,
                Revision:saved.revision,OperationRevision:saved.snapshot.fresh.record.revision,
                SnapshotJSON:canonical(saved.snapshot),ResultJSON:canonical(saved.result)});
            if (check.actorId!==j.actorId || check.operationId!==j.operationId || check.checkId!==j.intent.checkId ||
                check.revision!==j.intent.expectedRevision || check.snapshot.initial.record.sourceMilestoneId!==j.sourceMilestoneId ||
                check.snapshot.initial.record.destinationMilestoneId!==j.intent.destinationMilestoneId ||
                check.result.sourceFolderId!==j.sourceFolderId || check.result.destinationFolderId!==j.destinationFolderId ||
                !check.result.ready&&!j.events.some((e:any)=>e.reason==='RESTORE_ONLY_EXPLICIT_REQUEST')) throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            const restoreOnly=j.events.some((e:any)=>e.reason==='RESTORE_ONLY_EXPLICIT_REQUEST');
            if(restoreOnly&&(check.result.ready||j.step!=='RECONCILIATION_REQUIRED'||j.receipt)||!check.result.ready&&!restoreOnly)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            if(check.result.ready){
                // Cleanup footprint is fixed by the immutable user check, independently of the journal checksum.
                const gets=new Map<string,any>(check.snapshot.drive[0]?.gets),checked=check.snapshot.assessment.sourceTree.folders;
                const footprint=checked.map((id:string)=>{const f=gets.get(id);
                    if(!f||f.id!==id||f.mimeType!=='application/vnd.google-apps.folder'||f.trashed!==false||!Array.isArray(f.parents)||
                        !f.parents.length||id!==j.sourceFolderId&&f.parents.length!==1)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                    return {id,parentId:id===j.sourceFolderId?null:f.parents[0]};});
                const ordered=(values:{id:string;parentId:string|null}[])=>[...values].sort((a,b)=>a.id.localeCompare(b.id));
                if(canonical(ordered(j.folders))!==canonical(ordered(footprint))||canonical([...j.rootParents].sort())!==canonical(gets.get(j.sourceFolderId)?.parents))
                    throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            }
            // An intent is a single pending transition, not a reusable permission to invent a later response.
            let pendingIntent=false,ownedTrash=false,completed=false;
            let previousStep:FinalizationStep|undefined;
            if(j.events[0].step!=='TRASH_INTENT')throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            for(const event of j.events){
                if(completed)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                switch(event.step){
                    case 'TRASH_INTENT':
                        if(event.reason!=='FRESH_RECHECK')throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                        pendingIntent=true;ownedTrash=false;break;
                    case 'TRASH_CONFIRMED':
                        if(event.reason==='OWNED_TRASH_RESPONSE'){
                            if(!pendingIntent||ownedTrash)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                            pendingIntent=false;ownedTrash=true;
                        }else if(event.reason==='OWNED_TRASH_OBSERVED'){
                            if(!ownedTrash||pendingIntent)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                        }else throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                        break;
                    case 'RECONCILIATION_REQUIRED':
                        // An uncertain/read/census/restore outcome ends the outstanding response window.
                        pendingIntent=false;
                        if(event.reason==='OWNED_ROOT_RESTORED'){
                            if(!ownedTrash||previousStep!=='RECONCILIATION_REQUIRED')throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                            ownedTrash=false;
                        }
                        if(event.reason==='RESTORE_ONLY_EXPLICIT_REQUEST'&&!ownedTrash)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                        break;
                    case 'COMPLETED':
                        if(!ownedTrash||pendingIntent||previousStep!=='TRASH_CONFIRMED'||event.reason!=='GUARDED_DATABASE_CLEANUP_COMMITTED')throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                        completed=true;break;
                }
                if(['OWNED_ROOT_RESTORED','RESTORE_ONLY_EXPLICIT_REQUEST'].includes(event.reason)&&event.step!=='RECONCILIATION_REQUIRED')
                    throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                previousStep=event.step;
            }
            if(j.folderTrashed!==ownedTrash||j.step==='TRASH_INTENT'&&(!pendingIntent||ownedTrash)||
                ['TRASH_CONFIRMED','COMPLETED'].includes(j.step)&&(!ownedTrash||pendingIntent)||j.step==='RECONCILIATION_REQUIRED'&&pendingIntent)
                throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            const reachable=new Set<string>(),queue=[j.sourceFolderId],children=new Map<string,string[]>();for(const f of j.folders)if(f.parentId!==null)children.set(f.parentId,[...(children.get(f.parentId)||[]),f.id]);while(queue.length){const id=queue.shift()!;if(reachable.has(id))throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);reachable.add(id);queue.push(...(children.get(id)||[]));}if(reachable.size!==j.folders.length)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            for (const f of j.folders) if(f.id!==j.sourceFolderId&&(f.parentId===null||!j.folders.some((p:any)=>p.id===f.parentId)))throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            if (j.step === 'TRASH_CONFIRMED' && !j.folderTrashed || j.step !== 'COMPLETED' && j.receipt ||
                j.step === 'COMPLETED' && (!/^[a-f0-9]{64}$/.test(j.receipt?.revision) || !j.folderTrashed || !j.receipt || canonical(j.receipt) !== canonical(this.ack(j, j.receipt.revision))))
                throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            return j;
        } catch { throw new Error('SNAPSHOT_INTEGRITY_ERROR',409); }
    }
    static advance(j: FinalizationJournal, step: FinalizationStep, reason: string, trashed = j.folderTrashed) {
        if (j.step === 'COMPLETED') throw new Error('IDEMPOTENCY_CONFLICT',409);
        return { ...j, step, folderTrashed: trashed, events: [...j.events, { step, reason }] };
    }
    static ack(j: FinalizationJournal, revision: string): FinalizationAck {
        const completed = j.step === 'COMPLETED';
        return { operationId: j.operationId, revision, requestId: j.intent.requestId, checkId: j.intent.checkId,
            checkedRevision: j.intent.expectedRevision, destinationMilestoneId: j.intent.destinationMilestoneId,
            state: completed ? 'COMPLETED' : j.step === 'RECONCILIATION_REQUIRED' ? 'RECONCILIATION_REQUIRED' : 'FINALIZING',
            documentsReady: completed, sourceDatabaseRemoved: completed, sourceFolderTrashed: j.folderTrashed };
    }
}
