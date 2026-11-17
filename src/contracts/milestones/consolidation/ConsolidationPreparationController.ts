import type { PoolConnection } from 'mysql2/promise';
import type { OAuth2Client } from 'google-auth-library';
import type { UserData, ProjectScope } from '../../../types/sessionTypes';
import BaseController from '../../../controllers/BaseController';
import Lifecycle from '../sharing/MilestoneLifecycleController';
import Access from './ConsolidationAccessValidator';
import AccessController from './ConsolidationAccessController';
import PreviewRepository from './ConsolidationPreviewRepository';
import OperationRepository from './ConsolidationOperationRepository';
import Operation from './ConsolidationOperation';
import Reader from './ConsolidationEffectsRepository';
import TransferValidator from './ConsolidationTransferValidator';
import Preview, { canonical } from './ConsolidationPreview';
import Preparation, { PreparationState, PreparationFolder } from './ConsolidationPreparation';
import Validator from './ConsolidationPreparationValidator';
import Repository from './ConsolidationPreparationRepository';
import Drive from './ConsolidationPreparationDrive';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

const repository = new Repository(), previews = new PreviewRepository(), reader = new Reader();

export default class ConsolidationPreparationController extends BaseController<any, any> {
    constructor() { super(repository); }

    /** One lifecycle lock across short durable DB steps and remote effects; never the transfer transaction. */
    static async addFromDto(input: unknown, user?: UserData, scope?: ProjectScope, auth?: OAuth2Client) {
        Access.actor(user);
        const request = Validator.request(input);
        let stage = 'LIFECYCLE_LOCK';
        try {
            return await Lifecycle.runWithConnection(async conn => {
                stage = 'SAVE_INTENT';
                let state = await this.step(conn, async () => {
                    const saved = await AccessController.getSaved(request.previewId, user, scope, conn);
                    const existing = await repository.find(user!.enviId, request.requestId, conn);
                    if (existing) {
                        if (existing.actorId !== user!.enviId || existing.requestId !== request.requestId ||
                            existing.previewId !== request.previewId || existing.expectedRevision !== request.expectedRevision)
                            throw new Error('IDEMPOTENCY_CONFLICT', 409);
                        await this.current(existing, user, scope, conn);
                        return existing;
                    }
                    if (saved.saved.revision !== request.expectedRevision) throw new Error('STALE_REVISION', 409);
                    Validator.initial(saved.text);
                    const next = Preparation.create(saved.text, user!.enviId, request.requestId);
                    await this.current(next, user, scope, conn, false);
                    if ((await repository.claims(next.cases.map(c => c.sourceId), conn)).length)
                        throw new Error('OPERATION_IN_PROGRESS', 409);
                    await repository.add(next, conn);
                    return next;
                });
                // Authentication cannot create anything until the intent has committed.
                stage = 'AUTHENTICATE';
                return this.withAuth(async (_instance, client) => {
                    stage = 'PREPARE_TARGETS';
                    const destinationId = Preview.restore(state.previewText).content.request.destinationMilestoneId;
                    const persist = async () => {
                        if (await repository.save(state, conn) !== 1) throw new Error('RETRYABLE_STORAGE_ERROR', 503);
                    };
                    const check = () => this.step(conn, () => this.current(state, user, scope, conn));
                    const ensureFolder = async (folder: PreparationFolder): Promise<void> => {
                        if (folder.parentKey) await ensureFolder(state.folders.find(f => f.key === folder.parentKey)!);
                        await check();
                        const parent = folder.parentKey ? state.folders.find(f => f.key === folder.parentKey)!.id! : folder.parentId!;
                        await this.step(conn, async () => {
                            await this.current(state, user, scope, conn);
                            if (folder.parentKey) await this.aliases(state, state.folders.find(f => f.key === folder.parentKey)!, conn);
                            else {
                                const saved = Preview.restore(state.previewText).content;
                                const parentCase = saved.snapshot.rows.Cases.find(c => c.GdFolderId === parent && Number(c.MilestoneId) === destinationId);
                                Validator.aliases(await repository.aliases(parent, conn), [{ table: parentCase ? 'Cases' : 'Milestones',
                                    key: String(parentCase?.Id ?? destinationId) }]);
                            }
                        });
                        const parentBefore = await Drive.get(client, parent);
                        Validator.parent(parentBefore, parent);
                        if (!folder.id) {
                            const reserved = await Drive.reserve(client);
                            await this.step(conn, async () => { await this.current(state, user, scope, conn);
                                folder.id = reserved; await persist(); });
                        }
                        const owner = `${state.id}:${folder.key}`;
                        // A missing borrowed/confirmed folder is uncertain; never replace it or adopt by name.
                        let file;
                        try { file = await Drive.get(client, folder.id!); }
                        catch (error: any) {
                            if (!folder.owned || folder.ready || Number(error?.response?.status ?? error?.code) !== 404)
                                throw new Error('DRIVE_STATE_UNCERTAIN', 409);
                        }
                        if (!file) {
                            await this.step(conn, async () => { await this.current(state, user, scope, conn);
                                await this.aliases(state, folder, conn); folder.attempted = true; await persist(); });
                            // Same persisted ID on every retry, including a 404 after a lost response.
                            try { await Drive.create(client, folder.id!, parent, folder.name, owner); }
                            catch { throw new Error('DRIVE_STATE_UNCERTAIN', 503); }
                            file = await Drive.get(client, folder.id!);
                        }
                        const parentAfter = await Drive.get(client, parent);
                        Validator.parent(parentAfter, parent);
                        const parentShape = (value: any) => ({
                            id: value.id, name: value.name, parents: value.parents,
                            trashed: value.trashed, appProperties: value.appProperties ?? {}
                        });
                        if (canonical(parentShape(parentAfter)) !== canonical(parentShape(parentBefore)))
                            throw new Error('DRIVE_STATE_UNCERTAIN', 409);
                        Validator.folder(file, folder, parent, owner);
                        await this.step(conn, async () => {
                            await this.current(state, user, scope, conn);
                            await this.aliases(state, folder, conn);
                            folder.ready = true;
                            if (folder.owned && folder.caseTypeId !== null && !state.typeFolderRows.some(r => Number(r.CaseTypeId) === folder.caseTypeId))
                                state.typeFolderRows.push(await repository.insertTypeFolder(destinationId, folder.caseTypeId, folder.id!, conn));
                            await persist();
                        });
                    };
                    for (const c of state.cases) {
                        if (!c.row) await this.step(conn, async () => {
                            await this.current(state, user, scope, conn);
                            const parent = state.cases.find(p => p.sourceId === c.parentSourceId);
                            if (parent) {
                                if (!parent.row?.GdFolderId || !state.folders.find(f => f.key === parent.folderKey)?.ready)
                                    throw new Error('FOLDER_NOT_READY', 409);
                                c.parentId = Number(parent.row.Id);
                            }
                            const row = await repository.insertCase(c, destinationId, conn);
                            Validator.inserted(row, c, destinationId); c.row = row;
                            await persist();
                        });
                        const folder = state.folders.find(f => f.key === c.folderKey)!;
                        await ensureFolder(folder);
                        if (!c.row!.GdFolderId) await this.step(conn, async () => {
                            await this.current(state, user, scope, conn);
                            if (await repository.attachFolder(Number(c.row!.Id), folder.id!, conn) !== 1)
                                throw new Error('RECONCILIATION_REQUIRED', 409);
                            c.row = await repository.caseRow(Number(c.row!.Id), conn); await persist();
                        });
                    }
                    stage = 'PREPARATION_READBACK';
                    return this.step(conn, async () => {
                        const { snapshot, participants } = await this.current(state, user, scope, conn);
                        const ready = Preview.create(Preparation.request(state), snapshot,
                            { actorId: user!.enviId, projectOurId: snapshot.projectOurId, participantContractIds: participants.contractIds });
                        await previews.add(ready, conn);
                        return { preparationId: state.id, state: 'PREPARED' as const, previewId: ready.previewId,
                            revision: ready.revision, mappings: ready.content.request.mappings, requiresRevalidation: true,
                            transferPerformed: false, folderRollbackOnTransferFailure: false };
                    });
                }, auth);
            });
        } catch (error) {
            if (!(error instanceof Error) || error.status >= 500) {
                // Keep SQL values, OAuth tokens, raw messages and stacks out of diagnostics.
                const cause = error && typeof error === 'object' ? error as Record<string, any> : {};
                const code = error instanceof Error ? error.code : typeof cause.code === 'string' &&
                    /^(?:ER_[A-Z_]+|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|PROTOCOL_CONNECTION_LOST|RETRYABLE_STORAGE_ERROR|NESTED_LIFECYCLE_WRITE|invalid_grant|invalid_client)$/.test(cause.code)
                    ? cause.code : 'UNEXPECTED_ERROR';
                try { console.error('[PS-MC][prepare-targets]', { stage, code,
                    sqlState: typeof cause.sqlState === 'string' && /^[0-9A-Z]{5}$/.test(cause.sqlState) ? cause.sqlState : undefined,
                    errno: Number.isSafeInteger(cause.errno) && cause.errno >= 0 && cause.errno <= 65535 ? cause.errno : undefined,
                    httpStatus: Number.isInteger(cause.response?.status) && cause.response.status >= 100 && cause.response.status <= 599 ? cause.response.status : undefined });
                } catch { /* Logging failure must not change the saved request's outcome. */ }
            }
            if (error instanceof Error) throw error;
            throw new Error('RETRYABLE_STORAGE_ERROR', 503);
        }
    }
    private static async step<T>(conn: PoolConnection, action: () => Promise<T>): Promise<T> {
        try {
            await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
            await conn.beginTransaction();
            const result = await action(); await conn.commit(); return result;
        }
        catch (error) { try { await conn.rollback(); } catch { conn.destroy(); } throw error; }
    }
    private static async current(state: PreparationState, user: UserData | undefined, scope: ProjectScope | undefined,
        conn: PoolConnection, hasClaims = true) {
        Access.actor(user);
        const saved = await AccessController.getSaved(state.previewId, user, scope, conn);
        if (saved.text !== state.previewText) throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
        const request = saved.saved.content.request, ids = [request.sourceMilestoneId, request.destinationMilestoneId];
        const operations = await new OperationRepository().involving(ids, conn);
        const participants = await previews.participants(ids, conn);
        const project = Access.participants(ids, participants, scope);
        if (operations.length || request.operationId) {
            if (!request.operationId || operations.length !== 1 || operations[0] !== request.operationId)
                throw new Error('OPERATION_IN_PROGRESS', 409);
            const record = await new OperationRepository().find(request.operationId, conn);
            if (!record) throw new Error('OBJECT_NOT_FOUND', 404);
            const operation = Operation.restore(record);
            if (operation.projectOurId !== project || operation.sourceMilestoneId !== ids[0] || operation.destinationMilestoneId !== ids[1])
                throw new Error('OPERATION_IN_PROGRESS', 409);
            Access.participants(ids, { ...participants, contractIds: operation.participantContractIds,
                contracts: await previews.contracts(operation.participantContractIds, conn) }, scope);
            for (const moved of operation.caseMappings) {
                const mapping = request.mappings.find(m => m.sourceCaseId === moved.sourceCaseId);
                if (!mapping || mapping.target.mode !== 'existing' || mapping.target.caseId !== moved.destinationCaseId)
                    throw new Error('INVALID_MAPPING', 409);
            }
        }
        const snapshot = await reader.readEffects(project, ids,
            request.mappings.flatMap(m => m.target.mode === 'create' ? [m.target.name] : []), conn);
        const names = [...new Set([...Object.keys(snapshot.rows), 'MilestoneConsolidationPreparations',
            'MilestoneConsolidationTargetClaims', 'MilestoneConsolidationPreviews'].map(n => n.toLowerCase()))];
        TransferValidator.storage(await repository.storage(names, conn));
        Validator.current(state, snapshot, participants.contractIds);
        if (hasClaims && canonical((await repository.claims(state.cases.map(c => c.sourceId), conn))
            .map(r => [Number(r.SourceObjectId), r.PreparationId]).sort()) !==
            canonical(state.cases.map(c => [c.sourceId, state.id]).sort())) throw new Error('RECONCILIATION_REQUIRED', 409);
        return { snapshot, participants };
    }
    private static async aliases(state: PreparationState, folder: PreparationFolder, conn: PoolConnection) {
        const request = Preview.restore(state.previewText).content.request;
        const allowed = state.cases.filter(c => c.folderKey === folder.key && c.row).map(c => ({ table: 'Cases', key: String(c.row!.Id) }));
        if (folder.caseTypeId !== null) allowed.push({ table: 'CaseTypeFolders', key: `${request.destinationMilestoneId}:${folder.caseTypeId}` });
        Validator.aliases(await repository.aliases(folder.id!, conn), allowed);
    }
}
