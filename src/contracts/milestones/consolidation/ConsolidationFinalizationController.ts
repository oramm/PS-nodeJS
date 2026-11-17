import type { UserData, ProjectScope } from '../../../types/sessionTypes';
import type { PoolConnection } from 'mysql2/promise';
import type { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import ToolsDb from '../../../tools/ToolsDb';
import BaseController from '../../../controllers/BaseController';
import Lifecycle from '../sharing/MilestoneLifecycleController';
import Repository from './ConsolidationFinalizationRepository';
import Operations from './ConsolidationOperationRepository';
import Operation from './ConsolidationOperation';
import ReadinessController from './ConsolidationReadinessController';
import ReadinessRepository from './ConsolidationReadinessRepository';
import Readiness, { folderMime } from './ConsolidationReadiness';
import Check, { ReadinessObservation } from './ConsolidationReadinessCheck';
import Drive from './ConsolidationFinalizationDrive';
import Finalization, { FinalizationJournal } from './ConsolidationFinalization';
import Validator from './ConsolidationFinalizationValidator';
import Access from './ConsolidationAccessValidator';
import { canonical } from './ConsolidationPreview';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
const repository=new Repository(), operations=new Operations();
export default class ConsolidationFinalizationController extends BaseController<any,any> {
    constructor(){super(repository);}
    /** Unknown COMMIT: discard the connection. Caller must read the durable result on a fresh connection. */
    private static async transaction<T>(write:boolean, action:(conn:PoolConnection)=>Promise<T>) {
        const conn=await ToolsDb.pool.getConnection().catch(()=>{throw new Error('RETRYABLE_STORAGE_ERROR',503);});
        let discarded=false, committing=false;
        try {
            await conn.query('SET TRANSACTION ISOLATION LEVEL '+(write?'SERIALIZABLE':'REPEATABLE READ'));
            await conn.query(write?'START TRANSACTION':'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
            const result=await action(conn); committing=true; await conn.commit(); committing=false; return result;
        }catch(error){
            if(committing){discarded=true;conn.destroy();throw new Error('COMMIT_OUTCOME_UNKNOWN',503);}
            try{await conn.rollback();}catch{discarded=true;conn.destroy();}
            if(error instanceof Error)throw error;throw new Error('RETRYABLE_STORAGE_ERROR',503);
        }finally{if(!discarded)conn.release();}
    }
    static async addFromDto(id:unknown, body:unknown, user?:UserData, scope?:ProjectScope,
        machine?:{authenticatedMachine?:unknown;agentIdentity?:unknown}, retry=false, auth?:OAuth2Client) {
        Validator.human(user,machine);const intent=Validator.request(body),operationId=Access.uuid(id);user={...user!};
        // Auth occurs before acquisition of OAuth credentials, including replay and source-gone status.
        await this.transaction(false,conn=>repository.authorize(operationId,user!,scope,conn));
        return Lifecycle.runWithConnection(async()=>{
            const started:Promise<unknown>[]=[];
            const authorized=()=>this.transaction(false,conn=>repository.authorize(operationId,user!,scope,conn));
            const load=()=>this.transaction(false,async conn=>{
                const a=await repository.authorize(operationId,user!,scope,conn);
                const row=await repository.find(operationId,user!.enviId,intent.requestId,conn);
                const journal=row?Finalization.restore(row):undefined;
                if(journal&&canonical(journal.intent)!==canonical(intent))throw new Error('IDEMPOTENCY_CONFLICT',409);
                return {...a,journal};
            });
            let current=await load();
            if(current.journal?.step==='COMPLETED')return current.journal.receipt!;
            if(current.state.state==='COMPLETED') {
                // A superseded, unfinished request may acknowledge reconciliation against a freshly proven completed operation.
                if(current.journal)return Finalization.ack({...current.journal,step:'RECONCILIATION_REQUIRED',folderTrashed:true},current.record.revision);
                throw new Error('IDEMPOTENCY_CONFLICT',409);
            }
            if(current.journal&&current.state.finalization&&(current.state.finalization.actorId!==user!.enviId||current.state.finalization.requestId!==intent.requestId))
                return Finalization.ack({...current.journal,step:'RECONCILIATION_REQUIRED',folderTrashed:false},current.record.revision);
            const check=await this.transaction(false,async conn=>{await repository.authorize(operationId,user!,scope,conn);return repository.check(intent.checkId,conn);});
            if(check.actorId!==user!.enviId||check.operationId!==operationId||check.revision!==intent.expectedRevision||
                check.snapshot.initial.record.destinationMilestoneId!==intent.destinationMilestoneId||intent.destinationMilestoneId!==current.state.destinationMilestoneId)
                throw new Error('INVALID_REQUEST',400);
            try{return await this.withAuth(async(_instance,client)=>{
                const resource=new Drive(google.drive({version:'v3',auth:client}).files);
                const effect=async<T>(work:()=>Promise<T>)=>{await authorized();const p=work();started.push(p);return p;};
                const drive={get:(folder:string)=>effect(()=>resource.get(folder)),
                    list:(folder:string,token?:string,all=false)=>effect(()=>resource.list(folder,token,all)),
                    trash:(folder:string,value:boolean)=>effect(()=>resource.trash(folder,value))};
                const read=()=>this.transaction(false,conn=>repository.read(operationId,user!,scope,conn));
                const census=async(j:FinalizationJournal,trashed:boolean)=>{
                    const expected=new Map(j.folders.map(f=>[f.id,f.parentId])),seen=new Set<string>(),queue=[j.sourceFolderId];
                    while(queue.length){
                        const folder=queue.shift()!;
                        if(seen.has(folder)||seen.size>=10000||!expected.has(folder))throw new Error('DRIVE_STATE_UNCERTAIN',409);
                        await this.transaction(false,async conn=>{const r=await repository.read(operationId,user!,scope,conn);await repository.aliases([folder],r,conn);});
                        const file=await drive.get(folder);seen.add(folder);
                        if(file.id!==folder||file.mimeType!==folderMime||typeof file.trashed!=='boolean'||
                            folder===j.sourceFolderId&&(file.trashed!==trashed||canonical([...(file.parents||[])].sort())!==canonical([...j.rootParents].sort()))||!trashed&&file.trashed||
                            expected.get(folder)!==null&&(file.parents?.length!==1||file.parents[0]!==expected.get(folder)))throw new Error('DRIVE_STATE_UNCERTAIN',409);
                        let token:string|undefined;const tokens=new Set<string>(),children=new Set<string>();
                        do{
                            const page=await drive.list(folder,token,true);
                            if(!Array.isArray(page.files)||page.incompleteSearch!==undefined&&page.incompleteSearch!==false||tokens.size>=1000)
                                throw new Error('DRIVE_STATE_UNCERTAIN',409);
                            for(const child of page.files){
                                if(!child.id||children.has(child.id)||child.mimeType!==folderMime||!expected.has(child.id)||
                                    expected.get(child.id)!==folder||child.parents?.length!==1||child.parents[0]!==folder||
                                    typeof child.trashed!=='boolean'||!trashed&&child.trashed)throw new Error('SOURCE_POPULATED',409);
                                children.add(child.id);queue.push(child.id);
                            }
                            const next=page.nextPageToken;if(next!=null&&(typeof next!=='string'||!next||tokens.has(next)))throw new Error('DRIVE_STATE_UNCERTAIN',409);
                            if(next)tokens.add(next);token=next||undefined;
                        }while(token);
                    }
                    if(seen.size!==expected.size)throw new Error('DRIVE_STATE_UNCERTAIN',409);
                    const root=await drive.get(j.sourceFolderId);
                    if(root.id!==j.sourceFolderId||root.mimeType!==folderMime||root.trashed!==trashed||canonical([...(root.parents||[])].sort())!==canonical([...j.rootParents].sort()))throw new Error('DRIVE_STATE_UNCERTAIN',409);
                };
                const save=async(j:FinalizationJournal)=>{
                    await this.transaction(true,async conn=>{
                        const a=await repository.authorize(operationId,user!,scope,conn);
                        const old=await repository.find(operationId,user!.enviId,intent.requestId,conn);
                        if(old){const prior=Finalization.restore(old);if(canonical(prior.intent)!==canonical(intent))throw new Error('IDEMPOTENCY_CONFLICT',409);await repository.save(j,String(old.Revision),conn);}
                        else await repository.insert(j,conn);
                        const state=j.step==='RECONCILIATION_REQUIRED'?'RECONCILIATION_REQUIRED':'FINALIZING';
                        const next=Operation.transition(a.record,state,undefined,{actorId:user!.enviId,requestId:intent.requestId});
                        if(!await operations.edit(next,a.record.revision,conn))throw new Error('STALE_REVISION',409);
                    });current=await load();return Finalization.ack(j,current.record.revision);
                };
                const reconcile=async(j:FinalizationJournal,reason:string,restore:boolean)=>{
                    // Persist uncertainty before attempting restoration; a failed restore remains durably retryable.
                    let next=Finalization.advance(j,'RECONCILIATION_REQUIRED',reason,j.folderTrashed);await save(next);
                    if(restore){try{const beforeRestore=await drive.get(j.sourceFolderId);if(beforeRestore.id!==j.sourceFolderId||beforeRestore.mimeType!==folderMime||typeof beforeRestore.trashed!=='boolean'||canonical([...(beforeRestore.parents||[])].sort())!==canonical([...j.rootParents].sort()))throw new Error('DRIVE_STATE_UNCERTAIN',409);if(beforeRestore.trashed)await drive.trash(j.sourceFolderId,false);const root=await drive.get(j.sourceFolderId);
                        if(root.id!==j.sourceFolderId||root.mimeType!==folderMime||root.trashed!==false)throw new Error('DRIVE_STATE_UNCERTAIN',409);
                        next=Finalization.advance(next,'RECONCILIATION_REQUIRED','OWNED_ROOT_RESTORED',false);return save(next);
                    }catch{return Finalization.ack(next,(await load()).record.revision);}}
                    return Finalization.ack(next,(await load()).record.revision);
                };
                let journal=current.journal;
                if(!journal){
                    const histories=await this.transaction(false,async conn=>{await repository.authorize(operationId,user!,scope,conn);return repository.current(operationId,conn);});
                    const known=histories.map(Finalization.restore);
                    if(!check.result.ready){
                        // A different authorized manager binds their OWN blocked check and new explicit intent to restore only.
                        const owned=known.find(j=>j.actorId===current.state.finalization?.actorId&&j.intent.requestId===current.state.finalization?.requestId&&j.folderTrashed&&j.events.some(e=>e.step==='TRASH_CONFIRMED')&&j.sourceFolderId===check.result.sourceFolderId);
                        if(!retry||!owned||!check.snapshot.assessment.blockers.every((b:any)=>['SOURCE_MISSING_OR_CHANGED','STORED_FOLDER_OUTSIDE_SOURCE'].includes(b.code))||
                            check.snapshot.initial.record.sourceMilestoneId!==owned.sourceMilestoneId)throw new Error('CHECK_NOT_READY',409);
                        const {receipt:_priorReceipt,...base}=owned;
                        journal={...base,actorId:user!.enviId,intent,step:'RECONCILIATION_REQUIRED',
                            checkSnapshot:canonical(check),events:[...owned.events,{step:'RECONCILIATION_REQUIRED',reason:'RESTORE_ONLY_EXPLICIT_REQUEST'}]};
                        const root=await drive.get(owned.sourceFolderId);if(root.id!==owned.sourceFolderId||root.mimeType!==folderMime||root.trashed!==true||canonical([...(root.parents||[])].sort())!==canonical([...owned.rootParents].sort()))throw new Error('DRIVE_STATE_UNCERTAIN',409);
                        await save(journal);return reconcile(journal,'RESTORE_ONLY_RECHECK_REQUIRED',true);
                    }
                    if(current.state.state!=='TRANSFERRING'&&!retry)throw new Error('OPERATION_IN_PROGRESS',409);
                }
                if(journal?.events.some(e=>e.reason==='RESTORE_ONLY_EXPLICIT_REQUEST'))return reconcile(journal,'RESTORE_ONLY_RECHECK_REQUIRED',journal.folderTrashed);
                // Initial ready and present-root recovery both require TWO new full semantic observations before trash.
                const rootId=journal?.sourceFolderId??check.result.sourceFolderId;
                await this.transaction(false,async conn=>{const r=await repository.read(operationId,user!,scope,conn);await repository.aliases([rootId],r,conn);});
                let root;try{root=await drive.get(rootId);}catch{if(journal)return reconcile(journal,'ROOT_READ_UNCERTAIN',false);throw new Error('DRIVE_STATE_UNCERTAIN',409);}
                if(!root||root.id!==rootId||root.mimeType!==folderMime||typeof root.trashed!=='boolean')throw new Error('DRIVE_STATE_UNCERTAIN',409);
                if(!root.trashed){
                    const initial=await read();
                    if(canonical(initial.sql)!==canonical(check.snapshot.fresh.sql))throw new Error('STALE_CHECK',409);
                    const observations:ReadinessObservation[]=[];
                    const port={read,aliases:(folder:string)=>this.transaction(false,async conn=>{
                        await repository.authorize(operationId,user!,scope,conn);const aliases=await new ReadinessRepository().aliases(folder,conn);
                        const model=Readiness.inspect(Operation.restore(initial.record),initial.sql);observations.push({aliasFolder:folder,inUse:aliases.some(a=>!model.removableReferences.has(`${a.table}:${a.key}`))});return aliases;}),
                        drive:{get:async(folder:string)=>{const file=await drive.get(folder);observations.push({get:folder,file});return file;},list:async(folder:string,token?:string)=>{const page=await drive.list(folder,token);observations.push({list:folder,page});return page;}}};
                    const first=await ReadinessController.check(operationId,initial.record.revision,user,scope,port,initial),firstProof=Check.census(observations);
                    const start=observations.length,second=await ReadinessController.check(operationId,initial.record.revision,user,scope,port,initial);
                    if(!first.ready||!second.ready||canonical(firstProof)!==canonical(check.snapshot.drive[0])||canonical(firstProof)!==canonical(Check.census(observations.slice(start))))throw new Error('STALE_CHECK',409);
                    const folders=first.sourceTree.folders.map(folder=>({id:folder,parentId:folder===rootId?null:
                        (firstProof.gets.find(([id])=>id===folder)?.[1] as any)?.parents?.[0]??null}));
                    const next:FinalizationJournal={version:1,operationId,actorId:user!.enviId,intent,sourceMilestoneId:current.state.sourceMilestoneId,
                        sourceFolderId:rootId,destinationFolderId:check.result.destinationFolderId,rootParents:[...(root.parents||[])].sort(),folders,checkSnapshot:canonical(check),
                        step:'TRASH_INTENT',folderTrashed:false,events:journal?[...journal.events,{step:'TRASH_INTENT',reason:'FRESH_RECHECK'}]:[{step:'TRASH_INTENT',reason:'FRESH_RECHECK'}]};
                    // Include previously trashed children BEFORE intent/trash; no hidden discarded documents can be mistaken for empty.
                    await census(next,false);
                    await this.transaction(true,async conn=>{const r=await repository.read(operationId,user!,scope,conn);
                        if(canonical(r)!==canonical(initial))throw new Error('STALE_CHECK',409);await repository.aliases(folders.map(f=>f.id),r,conn);await repository.cleanup(next,r,conn,true);});
                    await save(next);journal=next;
                    // A last root get after intent is an observation, not an atomic cloud lock.
                    await census(journal,false);
                    try{const response=await drive.trash(rootId,true);if(response.id!==rootId||response.mimeType!==folderMime||response.trashed!==true||canonical([...(response.parents||[])].sort())!==canonical([...journal.rootParents].sort()))throw new Error('DRIVE_STATE_UNCERTAIN',409);}catch{return reconcile(journal,'TRASH_OUTCOME_UNKNOWN',false);}
                    journal=Finalization.advance(journal,'TRASH_CONFIRMED','OWNED_TRASH_RESPONSE',true);await save(journal);
                }else if(!journal||!journal.events.some(e=>e.step==='TRASH_INTENT'))throw new Error('DRIVE_STATE_UNCERTAIN',409);
                // Intent alone cannot distinguish a crash before our call from a later external trash. Restore and recheck instead.
                if(!journal)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
                if(!journal.folderTrashed||!journal.events.some(e=>e.step==='TRASH_CONFIRMED'))return reconcile(journal,'OWNED_TRASH_NOT_CONFIRMED',false);
                if(journal.step!=='TRASH_CONFIRMED'){journal=Finalization.advance(journal,'TRASH_CONFIRMED','OWNED_TRASH_OBSERVED',true);await save(journal);}
                try{await census(journal,true);}catch{return reconcile(journal,'POST_TRASH_CENSUS_CHANGED',true);}
                // Required destination occurrences and SQL contents are freshly proved even during owned-trash recovery.
                const before=await read(),model=Readiness.inspect(Operation.restore(before.record),before.sql);
                if(model.blockers.length||canonical(before.sql)!==canonical(check.snapshot.fresh.sql))return reconcile(journal,'SQL_OR_MAPPING_CHANGED',true);
                for(const folder of model.destinationFolders){const file=await drive.get(folder);if(file.id!==folder||file.mimeType!==folderMime||file.trashed!==false)return reconcile(journal,'DESTINATION_CHANGED',true);}
                const links=before.sql.rows.MilestoneContractLinks||[];
                for(const contractId of new Set([...current.state.participantContractIds,...links.filter(l=>Number(l.MilestoneId)===current.state.destinationMilestoneId).map(l=>Number(l.ContractId))])){
                    if(contractId===current.state.accountingContractId)continue;
                    const link=links.find(l=>Number(l.MilestoneId)===current.state.destinationMilestoneId&&Number(l.ContractId)===contractId),contract=before.sql.rows.Contracts.find(c=>Number(c.Id)===contractId);
                    if(!link?.ShortcutId||link.ShortcutStatus!=='READY'||link.OperationId!=null||!contract?.GdFolderId)return reconcile(journal,'SHORTCUT_CHANGED',true);
                    const file=await drive.get(String(link.ShortcutId));
                    if(file.id!==link.ShortcutId||file.mimeType!=='application/vnd.google-apps.shortcut'||file.trashed!==false||file.parents?.length!==1||file.parents[0]!==contract.GdFolderId||file.shortcutDetails?.targetId!==journal.destinationFolderId||file.appProperties?.psMilestoneLink!==`${current.state.destinationMilestoneId}:${contractId}`)return reconcile(journal,'SHORTCUT_CHANGED',true);
                }
                try{await census(journal,true);}catch{return reconcile(journal,'LAST_CENSUS_CHANGED',true);}
                const finishing=journal;
                try{return await this.transaction(true,async conn=>{
                    const r=await repository.read(operationId,user!,scope,conn);
                    if(canonical(r)!==canonical(before))throw new Error('STALE_CHECK',409);
                    await repository.aliases(finishing.folders.map(f=>f.id),r,conn);
                    const row=await repository.find(operationId,user!.enviId,intent.requestId,conn);
                    if(!row||canonical(Finalization.restore(row))!==canonical(finishing))throw new Error('IDEMPOTENCY_CONFLICT',409);
                    await repository.cleanup(finishing,r,conn);
                    const completed=Operation.transition(r.record,'COMPLETED',{actorId:user!.enviId,requestId:intent.requestId,
                        sourceFolderId:finishing.sourceFolderId,sourceDatabaseRemoved:true,sourceFolderTrashed:true,documentsReady:true},{actorId:user!.enviId,requestId:intent.requestId});
                    if(!await operations.edit(completed,r.record.revision,conn))throw new Error('STALE_REVISION',409);
                    const done=Finalization.advance(finishing,'COMPLETED','GUARDED_DATABASE_CLEANUP_COMMITTED',true);
                    done.receipt=Finalization.ack(done,completed.revision);await repository.save(done,String(row.Revision),conn);
                    return done.receipt;
                });}catch(error){
                    if((error as Error).code==='COMMIT_OUTCOME_UNKNOWN'){
                        // No further destructive call: confirm only the exact committed receipt on a fresh authorized connection.
                        try{const fresh=await load();if(fresh.journal?.step==='COMPLETED')return fresh.journal.receipt!;}catch{}
                        throw new Error('COMMIT_OUTCOME_UNKNOWN',503);
                    }
                    return reconcile(finishing,'DATABASE_CLEANUP_BLOCKED',true);
                }
            },auth);}finally{await Promise.allSettled(started);}
        });
    }
}
