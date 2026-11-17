import type { UserData } from '../../../types/sessionTypes';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

export default class ConsolidationGuidanceValidator {
    static actor(user?: UserData) {
        // This minimal read uses the existing project scope. Management APIs keep their separate role gate.
        if (!user || !Number.isSafeInteger(user.enviId) || user.enviId <= 0) throw new Error('SESSION_REQUIRED',401);
    }
    static request(input: unknown) {
        const b=input as {milestoneIds:number[];caseIds:number[]};
        if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).sort().join(',')!=='caseIds,milestoneIds')throw new Error('INVALID_REQUEST');
        const valid=(a:unknown):a is number[]=>Array.isArray(a)&&a.length<=100&&a.every(n=>Number.isSafeInteger(n)&&n>0&&n<=2147483647)&&new Set(a).size===a.length;
        if(!valid(b.milestoneIds)||!valid(b.caseIds)||!b.milestoneIds.length&&!b.caseIds.length)throw new Error('INVALID_REQUEST');
        return {milestoneIds:[...b.milestoneIds],caseIds:[...b.caseIds]};
    }
}
