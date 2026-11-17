import type { UserData } from '../../../types/sessionTypes';
import Access from './ConsolidationAccessValidator';
import { AGENT_SYSTEM_EMAIL } from '../../../setup/Sessions/agentSystemIdentity';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
export type HumanTransport={authenticatedMachine?:unknown;agentIdentity?:unknown};
export type FinalizationIntent = { requestId: string; checkId: string; expectedRevision: string;
    confirmDocumentsMoved: true; destinationMilestoneId: number };
export default class ConsolidationFinalizationValidator {
    static human(user?: UserData, machine?: { authenticatedMachine?: unknown; agentIdentity?: unknown }, management = true) {
        if (machine?.authenticatedMachine || machine?.agentIdentity != null || (user as any)?.agentIdentity != null ||
            (user as any)?.authenticatedMachine || user?.systemEmail?.trim().toLowerCase() === AGENT_SYSTEM_EMAIL)
            throw new Error('HUMAN_REQUIRED', 403);
        if (management) Access.actor(user);
        else if (!user || !Number.isSafeInteger(user.enviId) || user.enviId<=0) throw new Error('SESSION_REQUIRED',401);
    }
    static account(account: any, user: UserData, management = true) {
        if (!account || account.IsActive !== 1 || account.PersonId !== user.enviId) throw new Error('SESSION_REQUIRED', 401);
        if(management===false&&Number(account.SystemRoleId)!==user.systemRoleId)throw new Error('SESSION_REQUIRED',401);
        this.human({ ...user, systemRoleId: Number(account.SystemRoleId), systemEmail: account.SystemEmail }, undefined, management);
    }
    static request(input: unknown): FinalizationIntent {
        const b = input as FinalizationIntent;
        if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).sort().join(',') !==
            'checkId,confirmDocumentsMoved,destinationMilestoneId,expectedRevision,requestId' || b.confirmDocumentsMoved !== true ||
            !Number.isSafeInteger(b.destinationMilestoneId) || b.destinationMilestoneId <= 0 || b.destinationMilestoneId > 2147483647)
            throw new Error('INVALID_REQUEST', 400);
        return { requestId: Access.uuid(b.requestId), checkId: Access.uuid(b.checkId),
            expectedRevision: Access.revision({ expectedRevision: b.expectedRevision }),
            confirmDocumentsMoved: true, destinationMilestoneId: b.destinationMilestoneId };
    }
}
