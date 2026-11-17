import { ProjectScope, UserData } from '../../../types/sessionTypes';
import Error from './MilestoneSharingError';
import { AGENT_SYSTEM_EMAIL } from '../../../setup/Sessions/agentTokenAuth';

export default class MilestoneSharingValidator {
    static id(value: unknown): number {
        if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647)
            throw new Error('INVALID_REQUEST', 400);
        return Number(value);
    }

    static actor(user?: UserData, destructive = false) {
        if (!user) throw new Error('SESSION_REQUIRED', 401);
        if (![1, 2, 3].includes(user.systemRoleId)) throw new Error('ROLE_DENIED', 403);
        this.id(user.enviId);
        // Same identity as the global agent policy; checked again on receipt replay.
        if (destructive && user.systemEmail === AGENT_SYSTEM_EMAIL)
            throw new Error('AGENT_DESTRUCTIVE_DENIED', 403);
    }

    static scope(contracts: any[], scope?: ProjectScope) {
        if (scope && contracts.some(c => !scope.projectOurIds.includes(c.ProjectOurId)))
            throw new Error('SCOPE_DENIED', 403);
    }

    static request(body: any) {
        if (!body || Object.keys(body).some(k => !['requestId', 'expectedRevision'].includes(k)) ||
            typeof body.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId) ||
            typeof body.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(body.expectedRevision))
            throw new Error('INVALID_REQUEST', 400);
    }

    static parents(milestone: any, contracts: any[], targetId: number, attaching: boolean) {
        if (!milestone?.ContractId || milestone.OfferId != null) throw new Error('TYPE_MISMATCH');
        if (milestone.ContractId === targetId) throw new Error('SELF_LINK');
        if (!contracts.some(c => c.Id === targetId)) throw new Error('OBJECT_NOT_FOUND', 404);
        if (new Set(contracts.map(c => c.ProjectOurId)).size !== 1) throw new Error('CROSS_PROJECT');
        // v1 is intentionally limited to the dictionary identity verified in PS-MC-0.
        if (attaching && milestone.TypeId !== 5) throw new Error('TYPE_MISMATCH');
    }

    static available(rows: any[]) { if (!rows.length) throw new Error('TYPE_UNAVAILABLE'); }
    static unique(rows: any[]) { if (rows.length) throw new Error('UNIQUE_TYPE_CONFLICT'); }
    static destinationVacant(rows: any[]) { if (rows.length) throw new Error('DESTINATION_OCCUPIED'); }
    static idle(links: any[]) { if (links.some(l => l.OperationId)) throw new Error('OPERATION_IN_PROGRESS'); }
    static detachable(link: any) {
        if (!link?.ShortcutId && link?.ShortcutStatus === 'READY') throw new Error('SHORTCUT_NOT_READY', 503);
    }
    static detachIntent(snapshot: any, contracts: any[], target: number, intent: any) {
        const link = snapshot.links.find((l: any) => l.ContractId === target);
        if (!link || link.OperationId !== intent.operationId || link.ShortcutId !== intent.shortcutId ||
            snapshot.m.GdFolderId !== intent.targetFolder ||
            contracts.find(c => c.Id === target)?.GdFolderId !== intent.parentFolder ||
            snapshot.links.some((l: any) => l.ContractId !== target && l.OperationId))
            throw new Error('OPERATION_IN_PROGRESS');
    }
    static sameReceipt(stored: string, requested: string) {
        if (stored !== requested) throw new Error('IDEMPOTENCY_CONFLICT');
    }

    static exists(value: any) { if (!value) throw new Error('OBJECT_NOT_FOUND', 404); }
    static readable(m: any, contracts: any[]) {
        if (!m.ContractId || !contracts.length) throw new Error('TYPE_MISMATCH');
    }
    static creation(item: any, type: any, seen: Set<string>) {
        const key = item.contractId + ':' + item.typeId;
        if (type?.IsUniquePerContract && seen.has(key)) throw new Error('UNIQUE_TYPE_CONFLICT');
        seen.add(key);
    }
    static contract(dto: any, current: any, links: any[], deleting: boolean, moving: boolean) {
        this.exists(current);
        if (!links.length) return;
        if (deleting || moving ||
            (dto.projectOurId != null && dto.projectOurId !== current.ProjectOurId) ||
            (dto.typeId != null && dto.typeId !== current.TypeId) ||
            (dto.gdFolderId != null && dto.gdFolderId !== current.GdFolderId)) throw new Error('DEPENDENCY_CONFLICT');
    }
    static typeEdit(item: any, current: any, links: any[], deleting: boolean) {
        if ((deleting || Number(item.isUniquePerContract) !== Number(current?.IsUniquePerContract)) && links.length)
            throw new Error('DEPENDENCY_CONFLICT');
    }
    static date(row: any, dto: any) {
        this.exists(row);
        if ((dto.id != null && dto.id !== row.Id) ||
            (dto._milestone?.id != null && dto._milestone.id !== row.MilestoneId)) throw new Error('INVALID_REQUEST', 400);
        if (dto.milestoneId != null && dto.milestoneId !== row.MilestoneId) throw new Error('DEPENDENCY_CONFLICT');
    }
    static dateContract(m: any, dto: any) {
        if (!m?.ContractId) throw new Error('TYPE_MISMATCH');
        if (dto._milestone?._contract?.id !== m.ContractId) throw new Error('DEPENDENCY_CONFLICT');
    }

    static revision(expected: unknown, actual: string) {
        if (expected !== actual) throw new Error('STALE_REVISION');
    }

    static legacy(m: any, dto: any, links: any[], revision: string, deleting: boolean, wasShared = false) {
        if (!m) throw new Error('OBJECT_NOT_FOUND', 404);
        if (!links.length) {
            if (wasShared && !deleting) this.revision(dto._sharingRevision, revision);
            return;
        }
        if (links.some(l => l.OperationId)) throw new Error('OPERATION_IN_PROGRESS');
        if (deleting) throw new Error('SOURCE_ALREADY_SHARED');
        if ((dto.contractId != null && dto.contractId !== m.ContractId) ||
            (dto._contract?.id != null && dto._contract.id !== m.ContractId) || dto.offerId || dto._offer ||
            (dto.typeId != null && dto.typeId !== m.TypeId) ||
            (dto._type?.id != null && dto._type.id !== m.TypeId) ||
            (dto.gdFolderId != null && dto.gdFolderId !== m.GdFolderId))
            throw new Error('DEPENDENCY_CONFLICT');
        this.revision(dto._sharingRevision, revision);
    }
}
