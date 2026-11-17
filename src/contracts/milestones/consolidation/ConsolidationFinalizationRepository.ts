import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { UserData, ProjectScope } from '../../../types/sessionTypes';
import Operations from './ConsolidationOperationRepository';
import Operation from './ConsolidationOperation';
import Participants from './ConsolidationPreviewRepository';
import ReadinessRepository from './ConsolidationReadinessRepository';
import Readiness from './ConsolidationReadiness';
import Check from './ConsolidationReadinessCheck';
import Finalization, { FinalizationJournal } from './ConsolidationFinalization';
import Validator from './ConsolidationFinalizationValidator';
import Access from './ConsolidationAccessValidator';
import { canonical } from './ConsolidationPreview';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
export default class ConsolidationFinalizationRepository {
    async account(user:UserData,conn:PoolConnection,ordinary=false){
        Validator.human(user,undefined,!ordinary);
        const [accounts] = await conn.query<RowDataPacket[]>('SELECT PersonId, SystemRoleId, SystemEmail, IsActive FROM PersonAccounts WHERE PersonId=?', [user.enviId]);
        if (accounts.length !== 1) throw new Error('SESSION_REQUIRED',401);
        Validator.account(accounts[0], user, !ordinary);
        return accounts[0];
    }
    async authorize(id: string, user: UserData, scope: ProjectScope | undefined, conn: PoolConnection, ordinary = false) {
        Validator.human(user, undefined, !ordinary);
        const account=await this.account(user,conn,ordinary);
        const record = await new Operations().find(id, conn, false);
        if (!record || scope && !scope.projectOurIds.includes(record.projectOurId)) throw new Error('OBJECT_NOT_FOUND',404);
        if(ordinary&&[6,7].includes(Number(account.SystemRoleId))){
            if(!scope)throw new Error('SCOPE_DENIED',403);
            const [assigned]=await conn.query<RowDataPacket[]>('SELECT ProjectOurId FROM PersonProjects WHERE PersonId=?',[user.enviId]);
            scope={projectOurIds:scope.projectOurIds.filter(id=>assigned.some(p=>p.ProjectOurId===id))};
        }
        const state = Operation.restore(record), completed = state.state === 'COMPLETED';
        const ids = completed ? [state.destinationMilestoneId] : [state.sourceMilestoneId,state.destinationMilestoneId];
        const participants = new Participants(), current = await participants.participants(ids,conn);
        if (Access.participants(ids,current,scope) !== state.projectOurId) throw new Error('CROSS_PROJECT',409);
        const historical = await participants.contracts(state.participantContractIds,conn);
        if (Access.participants(ids,{...current,contractIds:state.participantContractIds,contracts:historical},scope) !== state.projectOurId)
            throw new Error('CROSS_PROJECT',409);
        if (!current.milestones.some(m=>Number(m.Id)===state.destinationMilestoneId&&Number(m.ContractId)===state.accountingContractId))
            throw new Error('MAPPING_CHANGED',409);
        if(!completed&&state.state!=='TRANSFERRING'){
            const pointer=state.finalization!;
            const row=await this.find(id,pointer.actorId,pointer.requestId,conn);
            if(!row)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            const j=Finalization.restore(row);
            if(j.operationId!==id||j.sourceMilestoneId!==state.sourceMilestoneId||j.intent.destinationMilestoneId!==state.destinationMilestoneId||j.step==='COMPLETED')throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
        }
        if (completed) {
            const proof = state.completion!;
            const row = await this.find(id,proof.actorId,proof.requestId,conn);
            if (!row) throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            const j = Finalization.restore(row);
            if (j.step !== 'COMPLETED' || !j.receipt || j.receipt.revision !== record.revision ||
                j.sourceMilestoneId !== state.sourceMilestoneId || j.intent.destinationMilestoneId !== state.destinationMilestoneId ||
                j.sourceFolderId !== proof.sourceFolderId) throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
            const [source] = await conn.query<RowDataPacket[]>('SELECT Id FROM Milestones WHERE Id=?',[state.sourceMilestoneId]);
            if (source.length) throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
        }
        return { record,state,actorRole:Number(account.SystemRoleId) };
    }
    async history(kind:'case'|'milestone',id:number,conn:PoolConnection){
        const where=kind==='milestone'?'SourceMilestoneId=?':"JSON_CONTAINS(JSON_EXTRACT(SnapshotJSON,'$.caseMappings'),JSON_OBJECT('sourceCaseId',?))";
        return (await conn.query<RowDataPacket[]>(`SELECT OperationId FROM MilestoneConsolidationOperations WHERE State='COMPLETED' AND ${where}`,[id]))[0];
    }
    async targetCase(id:number,milestoneId:number,conn:PoolConnection){return (await conn.query<RowDataPacket[]>('SELECT Id, Name FROM Cases WHERE Id=? AND MilestoneId=?',[id,milestoneId]))[0];}
    async targetMilestone(id:number,conn:PoolConnection){return (await conn.query<RowDataPacket[]>('SELECT Id, Name FROM Milestones WHERE Id=?',[id]))[0];}
    async find(id: string, actor: number, request: string, conn: PoolConnection) {
        return (await conn.query<RowDataPacket[]>('SELECT * FROM MilestoneConsolidationFinalizations WHERE OperationId=? AND ActorId=? AND RequestId=?',[id,actor,request]))[0][0];
    }
    async current(id: string, conn: PoolConnection) {
        const rows = (await conn.query<RowDataPacket[]>('SELECT * FROM MilestoneConsolidationFinalizations WHERE OperationId=? ORDER BY UpdatedAt DESC, CreatedAt DESC, ActorId, RequestId',[id]))[0];
        return rows;
    }
    async insert(j: FinalizationJournal, conn: PoolConnection) {
        const r = Finalization.pack(j);
        const [v] = await conn.query<ResultSetHeader>('INSERT INTO MilestoneConsolidationFinalizations (OperationId,ActorId,RequestId,StateJSON,Revision) VALUES (?,?,?,?,?)',
            [j.operationId,j.actorId,j.intent.requestId,r.stateJSON,r.revision]);
        if (v.affectedRows !== 1 || v.warningStatus) throw new Error('RETRYABLE_STORAGE_ERROR',503);
    }
    async save(j: FinalizationJournal, previous: string, conn: PoolConnection) {
        const r = Finalization.pack(j);
        const [v] = await conn.query<ResultSetHeader>('UPDATE MilestoneConsolidationFinalizations SET StateJSON=?, Revision=? WHERE OperationId=? AND ActorId=? AND RequestId=? AND Revision=?',
            [r.stateJSON,r.revision,j.operationId,j.actorId,j.intent.requestId,previous]);
        if (v.affectedRows !== 1 || v.warningStatus) throw new Error('STALE_REVISION',409);
    }
    async check(id: string, conn: PoolConnection) { const row = await new ReadinessRepository().check(id,conn);
        if (!row) throw new Error('OBJECT_NOT_FOUND',404); return Check.restore(row); }
    async read(id: string, user: UserData, scope: ProjectScope | undefined, conn: PoolConnection) {
        const authorized = await this.authorize(id,user,scope,conn);
        if (authorized.state.state === 'COMPLETED') throw new Error('IDEMPOTENCY_CONFLICT',409);
        return new ReadinessRepository().read(id,user,scope,conn);
    }
    async aliases(folders: string[], read: Awaited<ReturnType<ConsolidationFinalizationRepository['read']>>, conn: PoolConnection) {
        const model = Readiness.inspect(Operation.restore(read.record),read.sql);
        if (model.blockers.length) throw new Error('DEPENDENCY_CONFLICT',409);
        for (const folder of folders) {
            const aliases = await new ReadinessRepository().aliases(folder,conn);
            if (aliases.some(a=>!model.removableReferences.has(`${a.table}:${a.key}`))) throw new Error('FOLDER_IN_USE',409);
        }
    }
    /** Serializable caller owns the lock, transaction, authorization and journal/receipt commit. */
    async cleanup(j: FinalizationJournal, read: Awaited<ReturnType<ConsolidationFinalizationRepository['read']>>, conn: PoolConnection, validateOnly = false) {
        const state = Operation.restore(read.record), model = Readiness.inspect(state,read.sql);
        if (model.blockers.length || j.sourceFolderId !== model.sourceFolderId || j.destinationFolderId !== model.destinationFolderId ||
            j.sourceMilestoneId !== state.sourceMilestoneId || j.intent.destinationMilestoneId !== state.destinationMilestoneId)
            throw new Error('DEPENDENCY_CONFLICT',409);
        const query = async (sql: string, args: unknown[] = []) => (await conn.query<RowDataPacket[]>(sql,args))[0];
        const names = [...new Set([...Object.keys(read.sql.rows), 'MilestoneConsolidationFinalizations','MilestoneConsolidationOperations','MilestoneConsolidationChecks'].map(s=>s.toLowerCase()))];
        const engines = await query('SELECT LOWER(TABLE_NAME) AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME) IN (?)',[names]);
        if (engines.length !== names.length || engines.some(e=>e.engine !== 'InnoDB')) throw new Error('UNSUPPORTED_STORAGE',409);
        const deletedTables=['cases','milestones','milestonedates','casetypefolders','milestonesharingstate'];
        const triggers = await query("SELECT EVENT_OBJECT_TABLE, EVENT_MANIPULATION FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND ((LOWER(EVENT_OBJECT_TABLE) IN (?) AND EVENT_MANIPULATION='DELETE') OR LOWER(EVENT_OBJECT_TABLE) IN ('milestoneconsolidationoperations','milestoneconsolidationfinalizations'))",[deletedTables]);
        if (triggers.length) throw new Error('UNHANDLED_TRIGGER',409);
        const fks = await query(`SELECT k.TABLE_NAME,k.COLUMN_NAME,k.REFERENCED_TABLE_NAME,k.REFERENCED_COLUMN_NAME,k.ORDINAL_POSITION,r.DELETE_RULE,r.UPDATE_RULE
            FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME
            WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND LOWER(k.REFERENCED_TABLE_NAME) IN (?)`,[deletedTables]);
        const edges: Record<string,string> = {'cases.parentcaseid':'cases.id','cases.milestoneid':'milestones.id',
            'tasks.caseid':'cases.id','letters_cases.caseid':'cases.id','processinstances.caseid':'cases.id','risks.caseid':'cases.id',
            'securities.caseid':'cases.id','meetingarrangements.caseid':'cases.id','milestonedates.milestoneid':'milestones.id',
            'casetypefolders.milestoneid':'milestones.id','milestonesharingstate.milestoneid':'milestones.id','milestonecontractlinks.milestoneid':'milestones.id'};
        if (fks.some(f=>edges[`${f.TABLE_NAME}.${f.COLUMN_NAME}`.toLowerCase()] !== `${f.REFERENCED_TABLE_NAME}.${f.REFERENCED_COLUMN_NAME}`.toLowerCase() ||
            Number(f.ORDINAL_POSITION)!==1 || !['RESTRICT','NO ACTION','CASCADE'].includes(f.DELETE_RULE) || !['RESTRICT','NO ACTION','CASCADE'].includes(f.UPDATE_RULE)))
            throw new Error('UNHANDLED_REFERENCE',409);
        const cases = await query('SELECT Id, MilestoneId, ParentCaseId FROM Cases WHERE MilestoneId=? FOR UPDATE',[state.sourceMilestoneId]);
        if (canonical(cases.map(c=>Number(c.Id)).sort((a,b)=>a-b)) !== canonical(state.caseMappings.map(c=>c.sourceCaseId).sort((a,b)=>a-b)))
            throw new Error('MAPPING_CHANGED',409);
        const ids = cases.map(c=>Number(c.Id));
        // These global queries detect incoming rows that are outside the project snapshot.
        for (const [edge,target] of Object.entries(edges)) {
            const [table,column] = edge.split('.');
            if (table==='cases' || ['milestonedates','casetypefolders','milestonesharingstate'].includes(table)) continue;
            const values=target==='cases.id'?ids:[state.sourceMilestoneId]; if (!values.length) continue;
            const dependency=await query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${column} IN (?)`,[values]);
            if (Number(dependency[0]?.n)!==0) throw new Error('DEPENDENCY_CONFLICT',409);
        }
        if (ids.length) {
            const children=await query('SELECT Id, MilestoneId, ParentCaseId FROM Cases WHERE ParentCaseId IN (?) FOR UPDATE',[ids]);
            if (children.some(c=>!ids.includes(Number(c.Id)) || Number(c.MilestoneId)!==state.sourceMilestoneId)) throw new Error('DEPENDENCY_CONFLICT',409);
        }
        const pending=[...cases];
        while(pending.length) {
            const index=pending.findIndex(c=>!pending.some(child=>Number(child.ParentCaseId)===Number(c.Id)));
            if(index<0) throw new Error('DEPENDENCY_CONFLICT',409);
            const leaf=pending[index];
            if (!validateOnly && (await query('SELECT Id FROM Cases WHERE ParentCaseId=? FOR UPDATE',[leaf.Id])).length) throw new Error('DEPENDENCY_CONFLICT',409);
            if(validateOnly){pending.splice(index,1);continue;}
            const [v]=await conn.query<ResultSetHeader>('DELETE FROM Cases WHERE Id=? AND MilestoneId=?',[leaf.Id,state.sourceMilestoneId]);
            if(v.affectedRows!==1 || v.warningStatus) throw new Error('STALE_REVISION',409);
            pending.splice(index,1);
        }
        if(validateOnly)return;
        if ((await query('SELECT Id FROM Cases WHERE MilestoneId=? FOR UPDATE',[state.sourceMilestoneId])).length) throw new Error('DEPENDENCY_CONFLICT',409);
        for(const table of ['MilestoneDates','CaseTypeFolders','MilestoneSharingState'])
            await conn.query(`DELETE FROM ${table} WHERE MilestoneId=?`,[state.sourceMilestoneId]);
        const [v]=await conn.query<ResultSetHeader>('DELETE FROM Milestones WHERE Id=? AND GdFolderId=?',[state.sourceMilestoneId,j.sourceFolderId]);
        if(v.affectedRows!==1 || v.warningStatus) throw new Error('STALE_REVISION',409);
    }
}
