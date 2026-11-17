import ConsolidationGuard from '../consolidation/ConsolidationWriteGuardController';
import Operations from '../consolidation/ConsolidationOperationRepository';
import FinalizationRepository from '../consolidation/ConsolidationFinalizationRepository';
import { ConsolidationMappingError } from '../consolidation/ConsolidationMappingValidator';
import type { PoolConnection } from 'mysql2/promise';
import Lifecycle from './MilestoneLifecycleController';
import { createHash, randomUUID } from 'crypto';
import ToolsDb from '../../../tools/ToolsDb';
import { ProjectScope, UserData } from '../../../types/sessionTypes';
import Repository from './MilestoneSharingRepository';
import Validator from './MilestoneSharingValidator';
import SharingError from './MilestoneSharingError';
import ShortcutController from './MilestoneShortcutController';
import { OAuth2Client } from 'google-auth-library';

const repository = new Repository();

export default class MilestoneSharingController {
    // ponytail: one database-scoped lock serializes lifecycle operations across processes.
    // Replace with ordered per-contract locks if lifecycle throughput becomes a bottleneck.
    static async runExclusive<T>(action: () => Promise<T>): Promise<T> {
        return Lifecycle.run(action);
    }

    static revision(snapshot: any): string {
        return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    }

    static async get(id: number | string, user?: UserData, scope?: ProjectScope) {
        Validator.actor(user);
        id = Validator.id(id);
        const milestoneId = id;
        return this.runExclusive(async () => {
            const s = await repository.snapshot(milestoneId);
            Validator.exists(s.m);
            const contracts = await repository.contracts([s.m.ContractId, ...s.links.map(l => l.ContractId)]);
            Validator.scope(contracts, scope);
            Validator.readable(s.m, contracts);
            return this.response(milestoneId, s);
        });
    }

    private static response(id: number, s: any) {
        return { milestoneId: id, sourceContractId: s.m.ContractId, revision: this.revision(s),
            links: s.links.map((l: any) => ({ contractId: l.ContractId, shortcutStatus: l.ShortcutStatus, operationId: l.OperationId })) };
    }

    static async contractCreationCandidates(projectOurId: unknown, contractTypeId: unknown,
        user?: UserData, scope?: ProjectScope) {
        Validator.actor(user);
        if (typeof projectOurId !== 'string' || !projectOurId.trim() || projectOurId.length > 80)
            throw new SharingError('INVALID_REQUEST', 400);
        const targetTypeId = Validator.id(contractTypeId);
        if (scope && !scope.projectOurIds.includes(projectOurId))
            throw new SharingError('SCOPE_DENIED', 403);

        return this.runExclusive(async () => {
            const rows = await repository.contractCreationCandidates(projectOurId, targetTypeId);
            const result = [];
            for (const row of rows) {
                const snapshot = await repository.snapshot(row.Id);
                if (!snapshot.m || snapshot.m.ContractId !== row.ContractId ||
                    snapshot.m.TypeId !== 5 || snapshot.m.OfferId != null ||
                    snapshot.links.some(link => link.OperationId)) continue;
                const contracts = await repository.contracts([row.ContractId,
                    ...snapshot.links.map(link => link.ContractId)]);
                if (contracts.length !== new Set([row.ContractId,
                    ...snapshot.links.map(link => link.ContractId)]).size ||
                    contracts.some(contract => contract.ProjectOurId !== projectOurId)) continue;
                Validator.scope(contracts, scope);
                result.push({ milestoneId: row.Id, milestoneName: row.Name,
                    sourceContractId: row.ContractId, sourceContractName: row.SourceContractName,
                    sourceContractAlias: row.SourceContractAlias,
                    sourceContractOurId: row.SourceContractOurId,
                    expectedRevision: this.revision(snapshot) });
            }
            return result;
        });
    }

    static async mutate(id: number | string, target: number | string, method: 'PUT' | 'DELETE', body: any, user?: UserData, scope?: ProjectScope, auth?: OAuth2Client) {
        Validator.actor(user, method === 'DELETE');
        const milestoneId = Validator.id(id), targetId = Validator.id(target);
        return ConsolidationGuard.sharing(milestoneId, method === 'DELETE', () =>
            this.mutateValidated(milestoneId, targetId, method, body, user, scope, auth));
    }

    private static async assertTransferredShortcut(
        milestoneId: number, target: number, snapshot: Awaited<ReturnType<Repository['snapshot']>>,
        occupied: { Id: number }[], user: UserData, scope: ProjectScope | undefined, conn: PoolConnection, replay = false
    ) {
        const link = snapshot.links.find(row => row.ContractId === target);
        const recoverable = link && (['PENDING', 'FAILED'].includes(link.ShortcutStatus) ||
            replay && link.ShortcutStatus === 'READY' && !!link.ShortcutId);
        if (occupied.length !== 1 || !recoverable)
            throw new SharingError('DESTINATION_OCCUPIED');
        const operations = await new Operations().involving([milestoneId], conn);
        if (operations.length !== 1) throw new SharingError('DESTINATION_OCCUPIED');
        try {
            const { state } = await new FinalizationRepository().authorize(operations[0], user, scope, conn);
            if (state.state !== 'TRANSFERRING' || !state.units.length || state.units.some(unit => !unit.moved) ||
                state.destinationMilestoneId !== milestoneId || state.sourceMilestoneId !== occupied[0].Id ||
                state.accountingContractId !== snapshot.m.ContractId || !state.participantContractIds.includes(target))
                throw new SharingError('DESTINATION_OCCUPIED');
        } catch (error) {
            if (error instanceof ConsolidationMappingError) throw new SharingError(error.code, error.status);
            throw error;
        }
    }

    private static async mutateValidated(id: number, target: number, method: 'PUT' | 'DELETE', body: any, user?: UserData, scope?: ProjectScope, auth?: OAuth2Client) {
        Validator.request(body);
        return this.runExclusive(async () => {
            const endpoint = `${method}:/milestones/${id}/sharing/contracts/${target}`;
            const stored: any = await ToolsDb.transaction(async conn => {
                const s = await repository.snapshot(id, conn);
                Validator.exists(s.m);
                const contracts = await repository.contracts([s.m.ContractId, target, ...s.links.map(l => l.ContractId)], conn);
                Validator.scope(contracts, scope);
                Validator.parents(s.m, contracts, target, method === 'PUT');
                const payload = JSON.stringify({ expectedRevision: body.expectedRevision });
                const receipt = await repository.receipt(user!.enviId, endpoint, body.requestId, conn);
                if (receipt) {
                    Validator.sameReceipt(receipt.Payload, payload);
                    const previous = JSON.parse(receipt.Result);
                    if (method === 'PUT' && previous.phase === 'TRANSFERRED_SHORTCUT_PENDING') {
                        Validator.idle(s.links);
                        await this.assertTransferredShortcut(id, target, s,
                            await repository.ownedConflict(s.m.TypeId, target, id, conn), user!, scope, conn, true);
                    }
                    return previous;
                }
                Validator.revision(body.expectedRevision, this.revision(s));
                Validator.idle(s.links);
                if (method === 'PUT') {
                    const targetContract = contracts.find(c => c.Id === target)!;
                    Validator.available(await repository.availability(s.m.TypeId, targetContract.TypeId, conn));
                    Validator.unique(await repository.uniqueConflicts(s.m.TypeId, target, id, conn));
                    const occupied = await repository.ownedConflict(s.m.TypeId, target, id, conn);
                    if (occupied.length) {
                        await this.assertTransferredShortcut(id, target, s, occupied, user!, scope, conn);
                        const intent = { phase: 'TRANSFERRED_SHORTCUT_PENDING' };
                        await repository.saveReceipt(user!.enviId, endpoint, body.requestId, payload, intent, conn);
                        return intent;
                    }
                    await repository.attach(id, target, conn);
                } else {
                    const link = s.links.find(l => l.ContractId === target);
                    Validator.detachable(link);
                    if (link?.ShortcutId) {
                        const intent = { phase: 'DETACH_PENDING', operationId: randomUUID(),
                            shortcutId: link.ShortcutId, targetFolder: s.m.GdFolderId,
                            parentFolder: contracts.find(c => c.Id === target)!.GdFolderId };
                        await repository.beginDetach(id, target, intent.operationId, conn);
                        await repository.touch(id, conn);
                        await repository.saveReceipt(user!.enviId, endpoint, body.requestId, payload, intent, conn);
                        return intent;
                    }
                    await repository.detach(id, target, conn);
                }
                await repository.touch(id, conn);
                const updated = this.response(id, await repository.snapshot(id, conn));
                const result = method === 'PUT'
                    ? { milestoneId: id, sourceContractId: updated.sourceContractId, revision: updated.revision, contractId: target,
                        shortcutStatus: updated.links.find((l: any) => l.contractId === target)!.shortcutStatus }
                    : { milestoneId: id, contractId: target, detached: true, revision: updated.revision };
                const stored = method === 'PUT' ? { phase: 'SHORTCUT_PENDING', result } : result;
                await repository.saveReceipt(user!.enviId, endpoint, body.requestId, payload, stored, conn);
                return stored;
            });
            if (stored.phase === 'DETACH_PENDING') {
                const current = await repository.snapshot(id);
                const contracts = await repository.contracts([target]);
                Validator.detachIntent(current, contracts, target, stored);
                try {
                    await ShortcutController.remove(stored.shortcutId, stored.targetFolder,
                        stored.parentFolder, `${id}:${target}`, auth);
                } catch (error) {
                    await ToolsDb.transaction(async conn => {
                        await repository.shortcutFailed(id, target, conn);
                        await repository.touch(id, conn);
                    });
                    throw error;
                }
                return ToolsDb.transaction(async conn => {
                    Validator.detachIntent(await repository.snapshot(id, conn),
                        await repository.contracts([target], conn), target, stored);
                    await repository.detach(id, target, conn);
                    await repository.touch(id, conn);
                    const result = { milestoneId: id, contractId: target, detached: true,
                        revision: this.revision(await repository.snapshot(id, conn)) };
                    await repository.updateReceipt(user!.enviId, endpoint, body.requestId, result, conn);
                    return result;
                });
            }
            // Legacy and completed receipts replay exactly. Only a durable unfinished step resumes.
            if (stored.phase !== 'SHORTCUT_PENDING' && stored.phase !== 'TRANSFERRED_SHORTCUT_PENDING') return stored;
            const current = await repository.snapshot(id);
            Validator.exists(current.links.find(l => l.ContractId === target));
            Validator.idle(current.links);
            await ShortcutController.ensure(id, target, auth);
            return ToolsDb.transaction(async conn => {
                const updated = this.response(id, await repository.snapshot(id, conn));
                const result = { milestoneId: id, sourceContractId: updated.sourceContractId,
                    revision: updated.revision, contractId: target,
                    shortcutStatus: updated.links.find((l: any) => l.contractId === target)!.shortcutStatus };
                await repository.updateReceipt(user!.enviId, endpoint, body.requestId, result, conn);
                return result;
            });
        });
    }

    static async guardMilestone(dto: any, deleting = false) {
        const s = await repository.snapshot(Validator.id(dto.id));
        Validator.legacy(s.m, dto, s.links, this.revision(s), deleting, !!s.revision);
        if (!deleting && dto.typeId && dto.contractId)
            Validator.unique(await repository.uniqueConflicts(dto.typeId, dto.contractId, dto.id));
        return s;
    }

    static async guardCreate(items: any[]) {
        const seen = new Set<string>();
        for (const item of items) {
            if (!item.contractId) continue;
            const unique = await repository.type(item.typeId);
            Validator.creation(item, unique, seen);
            Validator.unique(await repository.uniqueConflicts(item.typeId, item.contractId));
        }
    }

    static async guardContract(dto: any, deleting = false, moving = false) {
        const id = Validator.id(dto.id);
        const rows = moving ? await repository.moveGroup(id) : await repository.contracts([id]);
        const links = rows.length ? await repository.contractLinks(rows.map(r => r.Id)) : [];
        const current = rows.find(r => r.Id === id);
        Validator.contract(dto, current, links, deleting, moving);
        return current;
    }

    static async decorate(items: any[]) {
        const tracked = new Set((await repository.trackedIds(items.map(item => item.milestoneId || item.id))).map(r => r.MilestoneId));
        for (const item of items) {
            const id = item.milestoneId || item.id;
            if (!tracked.has(id)) continue;
            const s = await repository.snapshot(id);
            if (s.links.length || s.revision) {
                item._sharingRevision = this.revision(s);
                if (item._milestone) item._milestone._sharingRevision = item._sharingRevision;
            }
        }
        return items;
    }

    static async guardType(item: any, deleting = false) {
        const id = Validator.id(item.id);
        const current = await repository.type(id);
        Validator.typeEdit(item, current, await repository.sharedType(id), deleting);
    }

    static async touch(id: number, conn?: import('mysql2/promise').PoolConnection) {
        const s = await repository.snapshot(id, conn);
        if (s.links.length || s.revision) await repository.touch(id, conn);
    }

    static async contractForDate(id: unknown, dto: any) {
        const row = await this.resolveDate(id, dto);
        const s = await repository.snapshot(row.MilestoneId);
        Validator.dateContract(s.m, dto);
        return s.m.ContractId as number;
    }

    static async resolveDate(id: unknown, dto: any) {
        const row = await repository.date(Validator.id(id));
        Validator.date(row, dto);
        return row;
    }

    static async guardDate(dto: any) {
        const row = await repository.date(Validator.id(dto.id));
        Validator.date(row, dto);
        const s = await repository.snapshot(row.MilestoneId);
        Validator.legacy(s.m, { id: row.MilestoneId, _sharingRevision: dto._sharingRevision }, s.links, this.revision(s), false, !!s.revision);
        return row.MilestoneId;
    }
}
