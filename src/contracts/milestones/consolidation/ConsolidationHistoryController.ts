import type { UserData, ProjectScope } from '../../../types/sessionTypes';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import ToolsDb from '../../../tools/ToolsDb';
import Repository from './ConsolidationFinalizationRepository';
import Validator,{HumanTransport} from './ConsolidationFinalizationValidator';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
export type HistoryResolution = { retired: boolean; sourceCaseId:number|null; sourceMilestoneId: number | null; destinationMilestoneId: number | null; destinationCaseId: number | null; destinationMilestoneName:string|null; destinationCaseName:string|null };
export default class ConsolidationHistoryController {
    /** Explicit read-only resolution; never use its target as a write payload. */
    static async resolve(input:unknown,user?:UserData,scope?:ProjectScope,machine?:HumanTransport) {
        Validator.human(user,machine,false);const b=input as {kind:'case'|'milestone';id:number};
        if(!b||Array.isArray(b)||Object.keys(b).sort().join(',')!=='id,kind'||!['case','milestone'].includes(b.kind)||!Number.isSafeInteger(b.id)||b.id<=0||b.id>2147483647)
            throw new Error('INVALID_REQUEST',400);
        const conn=await ToolsDb.pool.getConnection().catch(()=>{throw new Error('RETRYABLE_STORAGE_ERROR',503);});let discarded=false;
        try{await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
            const r=await this.inTransaction(b.kind,b.id,user!,scope,conn);await conn.commit();return r;
        }catch(error){try{await conn.rollback();}catch{discarded=true;conn.destroy();}if(error instanceof Error)throw error;throw new Error('RETRYABLE_STORAGE_ERROR',503);}
        finally{if(!discarded)conn.release();}
    }
    static async inTransaction(kind:'case'|'milestone',id:number,user:UserData,scope:ProjectScope|undefined,conn:PoolConnection):Promise<HistoryResolution> {
        Validator.human(user,undefined,false);
        await new Repository().account(user,conn,true);
        const rows=await new Repository().history(kind,id,conn);
        if(!rows.length)return {retired:false,sourceCaseId:null,sourceMilestoneId:null,destinationMilestoneId:null,destinationCaseId:null,destinationMilestoneName:null,destinationCaseName:null};
        if(rows.length!==1)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
        const {state}=await new Repository().authorize(String(rows[0].OperationId),user,scope,conn,true);
        const mapping=kind==='case'?state.caseMappings.find(m=>m.sourceCaseId===id):undefined;
        if(state.state!=='COMPLETED'||kind==='case'&&!mapping)throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
        const destination=await new Repository().targetMilestone(state.destinationMilestoneId,conn);if(destination.length!==1)throw new Error('OBJECT_NOT_FOUND',404);
        let destinationCaseName:string|null=null;const name=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():null;
        if(mapping){const target=await new Repository().targetCase(mapping.destinationCaseId,state.destinationMilestoneId,conn);if(target.length!==1)throw new Error('OBJECT_NOT_FOUND',404);destinationCaseName=name(target[0].Name);}
        return {retired:true,sourceCaseId:kind==='case'?id:null,sourceMilestoneId:state.sourceMilestoneId,destinationMilestoneId:state.destinationMilestoneId,destinationCaseId:mapping?.destinationCaseId??null,destinationMilestoneName:name(destination[0].Name),destinationCaseName};
    }
}
