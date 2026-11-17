import type { SqlContentSnapshot } from './ConsolidationReadRepository';
import type { OperationRecord } from './ConsolidationOperation';
import type { UserData, ProjectScope } from '../../../types/sessionTypes';
import type { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import ToolsDb from '../../../tools/ToolsDb';
import BaseController from '../../../controllers/BaseController';
import Repository from './ConsolidationReadinessRepository';
import Drive from './ConsolidationReadinessDrive';
import Validator from './ConsolidationReadinessValidator';
import Check, { ReadinessObservation } from './ConsolidationReadinessCheck';
import Operation from './ConsolidationOperation';
import Access from './ConsolidationAccessValidator';
import { canonical } from './ConsolidationPreview';
import Readiness, { folderMime, shortcutMime, ReadinessBlocker } from './ConsolidationReadiness';
import { ConsolidationMappingError } from './ConsolidationMappingValidator';

export type ReadinessFile = { id?: string | null; mimeType?: string | null; trashed?: boolean | null; parents?: string[] | null;
    shortcutDetails?: { targetId?: string | null } | null; appProperties?: Record<string, string> | null };
export type ReadinessRead = { record: OperationRecord; sql: SqlContentSnapshot; actorRole?: number };
export type ReadinessPort = {
    /** Each call owns a fresh consistent READ ONLY transaction and closes it before returning. */
    read: () => Promise<ReadinessRead>;
    /** Global stored-folder inventory, e.g. ConsolidationPreparationRepository.aliases. */
    aliases: (id: string) => Promise<{ table: string; key: string }[]>;
    drive: { get: (id: string) => Promise<ReadinessFile>;
        list: (parentId: string, pageToken?: string) => Promise<{ files?: ReadinessFile[]; nextPageToken?: string | null; incompleteSearch?: boolean | null }> };
};

/** Internal authorized read primitive. No pool, OAuth, or destructive operation is imported. */
const repository = new Repository();
export default class ConsolidationReadinessController extends BaseController<any, any> {
    constructor() { super(repository); }
    private static async transaction<T>(write: boolean, action: (conn: import('mysql2/promise').PoolConnection) => Promise<T>) {
        const conn = await ToolsDb.pool.getConnection().catch(() => { throw new ConsolidationMappingError('RETRYABLE_STORAGE_ERROR', 503); });
        let discarded = false;
        try {
            await conn.query('SET TRANSACTION ISOLATION LEVEL ' + (write ? 'SERIALIZABLE' : 'REPEATABLE READ'));
            await conn.query(write ? 'START TRANSACTION' : 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
            const result = await action(conn);
            await conn.commit();
            return result;
        } catch (error) {
            try { await conn.rollback(); } catch { discarded = true; conn.destroy(); }
            if (error instanceof ConsolidationMappingError) throw error;
            throw new ConsolidationMappingError('RETRYABLE_STORAGE_ERROR', 503);
        } finally { if (!discarded) conn.release(); }
    }
    static async addFromDto(id: unknown, body: unknown, user?: UserData, scope?: ProjectScope, auth?: OAuth2Client) {
        Access.actor(user); Validator.request(body);
        user = { ...user! }; // Bind one request actor; current role is still re-read from PersonAccounts.
        const operationId = Access.uuid(id);
        const read = () => this.transaction(false, conn => repository.read(operationId, user!, scope, conn));
        const authorized = () => this.transaction(false, conn => repository.authorize(operationId, user!, scope, conn));
        const initial = await read(); // Complete authorized SQL snapshot before OAuth or Drive.
        return this.withAuth(async (_instance, client) => {
            const drive = new Drive(google.drive({ version: 'v3', auth: client }).files);
            const observations: ReadinessObservation[] = [];
            const port: ReadinessPort = {
                read,
                aliases: folderId => this.transaction(false, async conn => {
                    await repository.authorize(operationId, user!, scope, conn);
                    const aliases = await repository.aliases(folderId, conn);
                    // Persist only the authorized folder's boolean collision result, no foreign keys/IDs.
                    const model = Readiness.inspect(Operation.restore(initial.record), initial.sql);
                    observations.push({ aliasFolder: folderId, inUse: aliases.some(a => !model.removableReferences.has(`${a.table}:${a.key}`)) });
                    return aliases;
                }),
                drive: {
                    get: async folderId => {
                        await authorized();
                        try { const value = await drive.get(folderId); observations.push({ get: folderId, file: JSON.parse(JSON.stringify(value)) }); return value; }
                        catch (error) { observations.push({ get: folderId, failed: true }); throw error; }
                    },
                    list: async (parentId, pageToken) => {
                        await authorized();
                        try { const value = await drive.list(parentId, pageToken); observations.push({ list: parentId, page: JSON.parse(JSON.stringify(value)) }); return value; }
                        catch (error) { observations.push({ list: parentId, failed: true }); throw error; }
                    },
                },
            };
            const assessment = await this.check(operationId, initial.record.revision, user, scope, port, initial);
            const firstCensus = Check.census(observations);
            let finalCensus = firstCensus;
            if (assessment.ready) {
                const start = observations.length;
                const finalAssessment = await this.check(operationId, initial.record.revision, user, scope, port, initial);
                finalCensus = Check.census(observations.slice(start));
                if (!finalAssessment.ready || canonical(firstCensus) !== canonical(finalCensus))
                    throw new ConsolidationMappingError('STALE_CHECK', 409);
                // Root metadata is observed last, after destination/shortcut reads.
                try {
                    const root = await port.drive.get(assessment.sourceFolderId);
                    const finalRoot = Check.census([{ get: assessment.sourceFolderId, file: root }]).gets[0];
                    const observedRoot = finalCensus.gets.find(([id]) => id === assessment.sourceFolderId);
                    if (canonical(finalRoot) !== canonical(observedRoot)) throw new ConsolidationMappingError('STALE_CHECK', 409);
                } catch (error) {
                    if (error instanceof ConsolidationMappingError) throw error;
                    throw new ConsolidationMappingError('STALE_CHECK', 409);
                }
            }
            const fresh = await read();
            if (canonical(initial) !== canonical(fresh) && !assessment.blockers.some(b => b.code === 'READ_STATE_CHANGED')) {
                assessment.blockers.push({ code: 'READ_STATE_CHANGED', reference: '' }); assessment.ready = false;
            }
            const result = await this.transaction(true, async conn => {
                const current = await repository.read(operationId, user!, scope, conn);
                if (canonical(current) !== canonical(fresh)) throw new ConsolidationMappingError('STALE_CHECK', 409);
                const model = Readiness.inspect(Operation.restore(current.record), current.sql);
                const registryAliases: [string, boolean][] = [];
                for (const [folderId, observedInUse] of finalCensus.aliases) {
                    const aliases = await repository.aliases(folderId, conn);
                    const inUse = aliases.some(a => !model.removableReferences.has(`${a.table}:${a.key}`));
                    if (inUse !== observedInUse) throw new ConsolidationMappingError('STALE_CHECK', 409);
                    registryAliases.push([folderId, inUse]);
                }
                const check = Check.create(user!.enviId, initial, current, assessment, [firstCensus, finalCensus, { registryAliases }]);
                await repository.add(check, conn);
                return check.result;
            });
            return result;
        }, auth);
    }
    static async check(id: unknown, expectedRevision: string, user: UserData | undefined, scope: ProjectScope | undefined, port: ReadinessPort, supplied?: ReadinessRead) {
        Access.actor(user);
        const operationId = Access.uuid(id);
        Access.revision({ expectedRevision });
        const authorize = (read: ReadinessRead) => {
            const state = Operation.restore(read.record);
            if (state.operationId !== operationId || read.record.revision !== expectedRevision)
                throw new ConsolidationMappingError('STALE_REVISION', 409);
            const milestones = read.sql.rows.Milestones;
            const current = [state.sourceMilestoneId, state.destinationMilestoneId];
            const contractIds = [...new Set([...state.participantContractIds,
                ...milestones.map(m => Number(m.ContractId)), ...(read.sql.rows.MilestoneContractLinks || []).map(l => Number(l.ContractId))])];
            const contracts = read.sql.rows.Contracts.filter(c => contractIds.includes(Number(c.Id)));
            if (Access.participants(current, { milestones, contracts, contractIds }, scope) !== state.projectOurId ||
                read.sql.projectOurId !== state.projectOurId) throw new ConsolidationMappingError('CROSS_PROJECT', 409);
            return state;
        };
        const initial = supplied ?? await port.read(), state = authorize(initial), model = Readiness.inspect(state, initial.sql);
        const blockers: ReadinessBlocker[] = [...model.blockers];
        const block = (code: string, reference = '') => { if (!blockers.some(b => b.code === code && b.reference === reference)) blockers.push({ code, reference }); };
        const folders = new Set<string>(), remaining: { id: string; parentId: string; mimeType: string }[] = [];
        let complete = true;
        const failure = (error: any, reference: string) => {
            complete = false;
            const status = Number(error?.response?.status ?? error?.code);
            block(status === 404 ? 'SOURCE_MISSING' : status === 403 ? 'SOURCE_INACCESSIBLE' : 'DRIVE_READ_FAILED', reference);
        };
        const safeReference = (folderId: string) => model.storedFolders.includes(folderId) ? folderId : model.sourceFolderId;
        const aliasChecks = new Map<string, boolean>();
        const allowedFolder = async (folderId: string) => {
            if (aliasChecks.has(folderId)) return aliasChecks.get(folderId)!;
            try {
                const aliases = await port.aliases(folderId);
                const inUse = aliases.some(r => !model.removableReferences.has(`${r.table}:${r.key}`));
                if (inUse) { complete = false; block('FOLDER_IN_USE', safeReference(folderId)); }
                aliasChecks.set(folderId, !inUse); return !inUse;
            } catch { complete = false; block('FOLDER_REFERENCE_CHECK_INCOMPLETE', safeReference(folderId)); aliasChecks.set(folderId, false); return false; }
        };
        const queue: { folderId: string; parentId?: string }[] = model.sourceFolderId ? [{ folderId: model.sourceFolderId }] : [];
        if (!queue.length) complete = false;
        while (queue.length) {
            if (folders.size >= 10000) { complete = false; block('DRIVE_ENUMERATION_INCOMPLETE'); break; }
            const { folderId, parentId } = queue.shift()!;
            if (folders.has(folderId)) { complete = false; block('DRIVE_ENUMERATION_INCOMPLETE', safeReference(folderId)); continue; }
            folders.add(folderId);
            if (!await allowedFolder(folderId)) continue;
            try {
                const file = await port.drive.get(folderId);
                if (file.id !== folderId || file.trashed !== false || file.mimeType !== folderMime ||
                    (parentId && (file.parents?.length !== 1 || file.parents[0] !== parentId))) {
                    complete = false; block('SOURCE_MISSING_OR_CHANGED', safeReference(folderId)); continue;
                }
                let pageToken: string | undefined;
                const tokens = new Set<string>(), children = new Set<string>();
                do {
                    if (tokens.size >= 1000 || children.size >= 10000) { complete = false; block('DRIVE_ENUMERATION_INCOMPLETE', folderId); break; }
                    const page = await port.drive.list(folderId, pageToken);
                    if ((page.incompleteSearch !== undefined && page.incompleteSearch !== false) || !Array.isArray(page.files)) { complete = false; block('DRIVE_ENUMERATION_INCOMPLETE', folderId); break; }
                    for (const child of page.files) {
                        if (!child || typeof child.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(child.id) ||
                            typeof child.mimeType !== 'string' || !child.mimeType || child.trashed !== false ||
                            child.parents?.length !== 1 || child.parents[0] !== folderId || children.has(child.id)) {
                            complete = false; block('DRIVE_ENUMERATION_INCOMPLETE', safeReference(folderId)); continue;
                        }
                        children.add(child.id);
                        if (child.mimeType === folderMime) queue.push({ folderId: child.id, parentId: folderId });
                        else {
                            const current = await port.drive.get(child.id);
                            if (current.id !== child.id || current.trashed !== false || current.mimeType !== child.mimeType ||
                                current.parents?.length !== 1 || current.parents[0] !== folderId) {
                                complete = false; block('DRIVE_ENUMERATION_INCOMPLETE', safeReference(folderId)); continue;
                            }
                            remaining.push({ id: child.id, parentId: folderId, mimeType: child.mimeType }); block('SOURCE_POPULATED', child.id);
                        }
                    }
                    const next = page.nextPageToken;
                    if (next != null && (typeof next !== 'string' || !next || tokens.has(next))) { complete = false; block('DRIVE_ENUMERATION_INCOMPLETE', folderId); break; }
                    if (next) tokens.add(next);
                    pageToken = next || undefined;
                } while (pageToken);
            } catch (error) { failure(error, safeReference(folderId)); }
        }
        // Stored case/type folders may have been moved away manually. Check their IDs as well as the old tree.
        for (const folderId of model.storedFolders) if (!folders.has(folderId)) block('STORED_FOLDER_OUTSIDE_SOURCE', folderId);
        for (const folderId of model.storedFolders) await allowedFolder(folderId);
        for (const folderId of model.destinationFolders) {
            try { const file = await port.drive.get(folderId);
                if (file.id !== folderId || file.trashed !== false || file.mimeType !== folderMime) block('DESTINATION_NOT_READY', folderId);
            } catch { block('DESTINATION_NOT_READY', folderId); }
        }
        const links = (initial.sql.rows.MilestoneContractLinks || []).filter(l => Number(l.MilestoneId) === state.destinationMilestoneId);
        for (const contractId of new Set([...state.participantContractIds, ...links.map(l => Number(l.ContractId))])) {
            if (contractId === state.accountingContractId) continue;
            const link = links.find(l => Number(l.ContractId) === contractId);
            const contract = initial.sql.rows.Contracts.find(c => Number(c.Id) === contractId);
            const reference = `contract:${contractId}`;
            if (!link?.ShortcutId || link.ShortcutStatus !== 'READY' || link.OperationId != null || !contract?.GdFolderId) {
                block('SHORTCUT_NOT_READY', reference); continue;
            }
            try { const file = await port.drive.get(String(link.ShortcutId));
                if (file.id !== link.ShortcutId || file.mimeType !== shortcutMime || file.trashed !== false || file.parents?.length !== 1 ||
                    file.parents[0] !== contract.GdFolderId || file.shortcutDetails?.targetId !== model.destinationFolderId ||
                    file.appProperties?.psMilestoneLink !== `${state.destinationMilestoneId}:${contractId}`) block('SHORTCUT_NOT_READY', reference);
            } catch { block('SHORTCUT_NOT_READY', reference); }
        }
        const fresh = await port.read();
        authorize(fresh);
        if (canonical(initial) !== canonical(fresh)) block('READ_STATE_CHANGED');
        return { operationId, revision: expectedRevision, ready: complete && blockers.length === 0, blockers,
            sourceFolderId: model.sourceFolderId, destinationFolderId: model.destinationFolderId,
            sourceTree: { folders: [...folders].sort(), remaining: remaining.sort((a,b) => a.id.localeCompare(b.id)), complete },
            verification: 'READ_ONLY_POINT_IN_TIME' as const, requiresRecheck: true as const };
    }
}
