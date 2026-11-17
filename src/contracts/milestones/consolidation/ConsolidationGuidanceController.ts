import type { ProjectScope, UserData } from '../../../types/sessionTypes';
import ToolsDb from '../../../tools/ToolsDb';
import GuardRepository from './ConsolidationWriteGuardRepository';
import Participants from './ConsolidationPreviewRepository';
import Access from './ConsolidationAccessValidator';
import Validator from './ConsolidationGuidanceValidator';
import GuidanceRepository from './ConsolidationGuidanceRepository';
import History from './ConsolidationHistoryController';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
const repository=new GuardRepository(),participants=new Participants();
const guidance=new GuidanceRepository();

export default class ConsolidationGuidanceController {
    static async workTargets(input: unknown,user?: UserData,scope?: ProjectScope) {
        Validator.actor(user);const request=Validator.request(input);
        const conn=await ToolsDb.pool.getConnection().catch(()=>{throw new Error('RETRYABLE_STORAGE_ERROR',503);});
        let discarded=false;
        try {
            await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
            await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
            const parents=await repository.caseParents(request.caseIds,conn);
            if(new Set(parents.map(p=>Number(p.Id))).size!==parents.length||parents.some(p=>!request.caseIds.includes(Number(p.Id))))throw new Error('OBJECT_NOT_FOUND',404);
            if(request.milestoneIds.length&&parents.some(p=>!request.milestoneIds.includes(Number(p.MilestoneId))))throw new Error('INVALID_REQUEST');
            const ids=[...new Set([...request.milestoneIds,...parents.map(p=>Number(p.MilestoneId))])];
            // Every supplied object is resolved and authorized before reading any operation metadata.
            const milestones=await guidance.milestones(ids,conn);
            if(new Set(milestones.map(m=>Number(m.Id))).size!==milestones.length||milestones.some(m=>!ids.includes(Number(m.Id))))throw new Error('OBJECT_NOT_FOUND',404);
            if(parents.some(p=>!milestones.some(m=>Number(m.Id)===Number(p.MilestoneId))))throw new Error('OBJECT_NOT_FOUND',404);
            const contractIds=milestones.filter(m=>m.ContractId!=null).map(m=>Number(m.Id));
            const offerParents=milestones.filter(m=>m.ContractId==null);
            if(offerParents.some(m=>!Number.isSafeInteger(m.OfferId)||Number(m.OfferId)<=0))throw new Error('OBJECT_NOT_FOUND',404);
            // The ordinary unrestricted offer flow already exists. Scoped roles still require a contract/project parent.
            if(offerParents.length&&scope)throw new Error('SCOPE_DENIED',403);
            const offerIds=[...new Set(offerParents.map(m=>Number(m.OfferId)))],offers=await guidance.offers(offerIds,conn);
            if(offers.length!==offerIds.length||new Set(offers.map(o=>Number(o.Id))).size!==offerIds.length||offers.some(o=>!offerIds.includes(Number(o.Id))))throw new Error('OBJECT_NOT_FOUND',404);
            const data=contractIds.length?await participants.participants(contractIds,conn):{milestones:[],links:[],contractIds:[],contracts:[]};
            // Ordinary letter work may span several authorized projects; authorize each object separately.
            for(const id of contractIds){
                const milestones=data.milestones.filter(m=>Number(m.Id)===id);
                const contractIds=[...new Set([...milestones.map(m=>Number(m.ContractId)),...data.links.filter(l=>Number(l.MilestoneId)===id).map(l=>Number(l.ContractId))])];
                Access.participants([id],{milestones,contractIds,contracts:data.contracts.filter(c=>contractIds.includes(Number(c.Id)))},scope);
            }
            const redirects=[];
            for(const id of request.milestoneIds.filter(id=>!milestones.some(m=>Number(m.Id)===id))){
                const resolved=await History.inTransaction('milestone',id,user!,scope,conn);
                if(!resolved.retired)throw new Error('OBJECT_NOT_FOUND',404);redirects.push(resolved);
            }
            for(const id of request.caseIds.filter(id=>!parents.some(p=>Number(p.Id)===id))){
                const resolved=await History.inTransaction('case',id,user!,scope,conn);
                if(!resolved.retired||request.milestoneIds.length&&!request.milestoneIds.includes(resolved.sourceMilestoneId!))throw new Error('OBJECT_NOT_FOUND',404);redirects.push(resolved);
            }
            if(redirects.length){await conn.commit();return {blocked:true,redirects};}
            const blocked=(await repository.sourceOperations(ids,conn)).length>0;
            await conn.commit();return {blocked};
        }catch(error){try{await conn.rollback();}catch{discarded=true;conn.destroy();}if(error instanceof Error)throw error;throw new Error('RETRYABLE_STORAGE_ERROR',503);}
        finally{if(!discarded)conn.release();}
    }
}
