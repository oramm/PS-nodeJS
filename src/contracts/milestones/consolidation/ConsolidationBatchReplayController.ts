import type { PoolConnection } from 'mysql2/promise';
import type { UserData, ProjectScope } from '../../../types/sessionTypes';
import Access from './ConsolidationAccessValidator';
import Repository from './ConsolidationFinalizationRepository';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
/** A retained apply receipt is historical transfer evidence, never a new batch or finalization ACK. */
export default class ConsolidationBatchReplayController {
    static async authorize(value:unknown,requestId:string,previewId:string,user:UserData,scope:ProjectScope|undefined,conn:PoolConnection){
        const result=value as {operationId:string;sourceMilestoneId:number;destinationMilestoneId:number;accountingContractId:number;state:string;documentsReady:boolean;revision:string};
        if(!result||typeof result!=='object'||Array.isArray(result))throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
        const {state}=await new Repository().authorize(Access.uuid(result.operationId),user,scope,conn);
        if(result.sourceMilestoneId!==state.sourceMilestoneId||result.destinationMilestoneId!==state.destinationMilestoneId||result.accountingContractId!==state.accountingContractId||result.state!=='TRANSFERRING'||result.documentsReady!==false||!/^[a-f0-9]{64}$/.test(result.revision)||
            !state.batches.some(b=>b.actorId===user.enviId&&b.requestId===requestId&&b.previewId===previewId))throw new Error('SNAPSHOT_INTEGRITY_ERROR',409);
    }
}
