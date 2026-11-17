jest.mock('../../../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: {}, transaction: jest.fn() } }));
jest.mock('../../../../tools/MilestoneShortcutDrive');
import ToolsDb from '../../../../tools/ToolsDb';
import Drive from '../../../../tools/MilestoneShortcutDrive';
import Controller from '../MilestoneSharingController';
import Repository from '../MilestoneSharingRepository';
import Shortcut from '../MilestoneShortcutController';
import Validator from '../MilestoneShortcutValidator';
import Lifecycle from '../MilestoneLifecycleController';

const user = { enviId: 125, systemRoleId: 3, systemEmail: 'test@example.invalid' } as any;
const folder = (id: string) => ({ id, mimeType: 'application/vnd.google-apps.folder', trashed: false,
    capabilities: { canAddChildren: true } });
const managed = () => ({ id: 'reserved', mimeType: 'application/vnd.google-apps.shortcut', trashed: false,
    capabilities: { canTrash: true }, parents: ['parent'], shortcutDetails: { targetId: 'source' }, appProperties: { psMilestoneLink: '10:2' } });
const missing = () => Object.assign(new Error('missing'), { code: 404 });

describe('durable managed shortcut', () => {
    let state: any, receipts: Map<string, any>, driveFile: any, inTransaction: boolean;
    let createdIds: string[];
    const request = () => ({ requestId: 'd6b25916-7420-4a46-b193-3dc1c2aab723', expectedRevision: Controller.revision(state) });
    beforeEach(() => {
        state = { m: { Id: 10, Name: 'Shared', ContractId: 1, TypeId: 5, OfferId: null, GdFolderId: 'source' },
            links: [], dates: [], revision: null };
        receipts = new Map(); driveFile = undefined; createdIds = []; inTransaction = false;
        jest.spyOn(Controller, 'runExclusive').mockImplementation(async action => action());
        jest.spyOn(Lifecycle, 'run').mockImplementation(async action => action());
        Object.assign(ToolsDb.pool, {getConnection: jest.fn(async () => ({query: jest.fn(async () => [[]]),release: jest.fn()}))});
        (ToolsDb.transaction as jest.Mock).mockImplementation(async action => {
            const before = JSON.stringify(state), beforeReceipts = new Map(receipts);
            inTransaction = true;
            try { return await action({}); }
            catch (error) { state = JSON.parse(before); receipts = beforeReceipts; throw error; }
            finally { inTransaction = false; }
        });
        jest.spyOn(Repository.prototype, 'snapshot').mockImplementation(async () => JSON.parse(JSON.stringify(state)));
        jest.spyOn(Repository.prototype, 'contracts').mockResolvedValue([
            { Id: 2, TypeId: 2, ProjectOurId: 'OWN', GdFolderId: 'parent' },
            { Id: 1, TypeId: 1, ProjectOurId: 'OWN', GdFolderId: 'owner' },
        ]);
        jest.spyOn(Repository.prototype, 'availability').mockResolvedValue([{}]);
        jest.spyOn(Repository.prototype, 'uniqueConflicts').mockResolvedValue([]);
        jest.spyOn(Repository.prototype, 'ownedConflict').mockResolvedValue([]);
        jest.spyOn(Repository.prototype, 'receipt').mockImplementation(async (_a, _e, key) => receipts.get(_e + key));
        jest.spyOn(Repository.prototype, 'saveReceipt').mockImplementation(async (_a, _e, key, payload, result) => {
            receipts.set(_e + key, { Payload: payload, Result: JSON.stringify(result) });
        });
        jest.spyOn(Repository.prototype, 'updateReceipt').mockImplementation(async (_a, _e, key, result) => {
            receipts.get(_e + key).Result = JSON.stringify(result);
        });
        jest.spyOn(Repository.prototype, 'attach').mockImplementation(async () => {
            if (!state.links.length) state.links.push({ ContractId: 2, ShortcutId: null, ShortcutStatus: 'PENDING' });
        });
        jest.spyOn(Repository.prototype, 'touch').mockImplementation(async () => { state.revision = String(Number(state.revision) + 1); });
        jest.spyOn(Repository.prototype, 'shortcutState').mockImplementation(async (_m, _c, id, status) => {
            state.links[0].ShortcutId = id; state.links[0].ShortcutStatus = status;
        });
        jest.spyOn(Repository.prototype, 'shortcutFailed').mockImplementation(async () => { state.links[0].ShortcutStatus = 'FAILED'; });
        jest.spyOn(Repository.prototype, 'beginDetach').mockImplementation(async (_m, _c, operationId) => {
            state.links[0].OperationId = operationId; state.links[0].ShortcutStatus = 'PENDING';
        });
        jest.spyOn(Repository.prototype, 'detach').mockImplementation(async () => { state.links = []; });
        (Drive.trash as jest.Mock).mockImplementation(async (_auth, id) => {
            expect(inTransaction).toBe(false);
            expect(id).toBe('reserved');
            expect(state.links[0].OperationId).toBeTruthy();
            const receipt = [...receipts.entries()].find(([key]) => key.startsWith('DELETE:'))![1];
            expect(JSON.parse(receipt.Result)).toMatchObject({ phase: 'DETACH_PENDING', shortcutId: id });
            driveFile.trashed = true;
        });
        (Drive.reserve as jest.Mock).mockImplementation(async () => { expect(inTransaction).toBe(false); return 'reserved'; });
        (Drive.get as jest.Mock).mockImplementation(async (_auth, id) => {
            expect(inTransaction).toBe(false);
            if (id === 'reserved') { if (!driveFile) throw missing(); return driveFile; }
            return folder(id);
        });
        (Drive.create as jest.Mock).mockImplementation(async (_auth, id) => {
            expect(inTransaction).toBe(false);
            expect(state.links[0].ShortcutId).toBe(id);
            expect(JSON.parse([...receipts.values()][0].Result).phase).toBe('SHORTCUT_PENDING');
            driveFile = managed(); createdIds.push(id);
        });
    });
    const run = (body: any) => Controller.mutate(10, 2, 'PUT', body, user, { projectOurIds: ['OWN'] } as any, {} as any);

    it('commits the identity before create, verifies readiness and replays without transport', async () => {
        const body = request(), result = await run(body);
        expect(result.shortcutStatus).toBe('READY');
        expect(state.m.GdFolderId).toBe('source');
        expect(createdIds).toEqual(['reserved']);
        const calls = (Drive.get as jest.Mock).mock.calls.length;
        expect(await run(body)).toEqual(result);
        expect(Drive.get).toHaveBeenCalledTimes(calls);
    });
    it('keeps the link and reserved ID after a create timeout; a new request adopts only that same ID', async () => {
        (Drive.create as jest.Mock).mockImplementationOnce(async () => {
            driveFile = managed(); createdIds.push('reserved'); throw new Error('timeout with secret');
        });
        const body = request();
        expect((await run(body)).shortcutStatus).toBe('FAILED');
        expect(state.links[0].ShortcutId).toBe('reserved');
        expect((await run(body)).shortcutStatus).toBe('FAILED');
        const retry = { ...request(), requestId: '56b25916-7420-4a46-b193-3dc1c2aab723' };
        expect((await run(retry)).shortcutStatus).toBe('READY');
        expect(createdIds).toEqual(['reserved']);
        expect(Drive.reserve).toHaveBeenCalledTimes(1);
    });
    it('resumes an unfinished receipt after response persistence fails, ignoring its own stale revision', async () => {
        (Repository.prototype.updateReceipt as jest.Mock).mockRejectedValueOnce(new Error('process stopped'));
        const body = request();
        await expect(run(body)).rejects.toThrow('process stopped');
        expect(JSON.parse([...receipts.values()][0].Result).phase).toBe('SHORTCUT_PENDING');
        expect((await run(body)).shortcutStatus).toBe('READY');
        expect(createdIds).toEqual(['reserved']);
    });
    it('does not create if committing the reserved identity fails', async () => {
        (Repository.prototype.shortcutState as jest.Mock).mockRejectedValueOnce(new Error('DB failure'));
        expect((await run(request())).shortcutStatus).toBe('FAILED');
        expect(Drive.create).not.toHaveBeenCalled();
        expect(state.links[0].ShortcutId).toBeNull();
    });
    it.each([403, 500, 429])('does not interpret shortcut read error %i as missing', async code => {
        state.links = [{ ContractId: 2, ShortcutId: 'reserved', ShortcutStatus: 'FAILED' }];
        (Drive.get as jest.Mock).mockImplementation(async (_auth, id) => {
            if (id === 'reserved') throw Object.assign(new Error('denied'), { code });
            return folder(id);
        });
        expect((await run(request())).shortcutStatus).toBe('FAILED');
        expect(Drive.create).not.toHaveBeenCalled();
    });
    it.each(['target', 'parent', 'owner', 'trashed', 'mime'])('rejects a %s mismatch without modifying the foreign object', async mismatch => {
        state.links = [{ ContractId: 2, ShortcutId: 'reserved', ShortcutStatus: 'PENDING' }];
        driveFile = managed();
        if (mismatch === 'target') driveFile.shortcutDetails.targetId = 'foreign';
        if (mismatch === 'parent') driveFile.parents = ['foreign'];
        if (mismatch === 'owner') driveFile.appProperties = {};
        if (mismatch === 'trashed') driveFile.trashed = true;
        if (mismatch === 'mime') driveFile.mimeType = 'application/vnd.google-apps.folder';
        const before = JSON.stringify(driveFile);
        expect((await run(request())).shortcutStatus).toBe('FAILED');
        expect(JSON.stringify(driveFile)).toBe(before);
        expect(Drive.create).not.toHaveBeenCalled();
    });
    it('handles a 404 followed by create conflict through exact-ID readback', async () => {
        (Drive.create as jest.Mock).mockImplementationOnce(async () => {
            driveFile = managed(); throw Object.assign(new Error('conflict'), { code: 409 });
        });
        expect((await run(request())).shortcutStatus).toBe('READY');
    });
    it('denies access before transport and still denies receipt replay after scope revocation', async () => {
        const body = request(); await run(body);
        const calls = (Drive.get as jest.Mock).mock.calls.length;
        await expect(Controller.mutate(10, 2, 'PUT', body, user, { projectOurIds: [] } as any, {} as any)).rejects.toThrow('SCOPE_DENIED');
        expect(Drive.get).toHaveBeenCalledTimes(calls);
    });
    const detach = (body: any, actor = user, scope = { projectOurIds: ['OWN'] }) =>
        Controller.mutate(10, 2, 'DELETE', body, actor, scope as any, {} as any);
    const ready = () => {
        state.links = [{ ContractId: 2, ShortcutId: 'reserved', ShortcutStatus: 'READY', OperationId: null }];
        driveFile = managed();
    };
    it('detaches only the owned shortcut, preserves source/dates and replays without transport', async () => {
        ready(); state.dates = [{ Id: 77, Description: 'unchanged' }];
        const original = JSON.stringify({ m: state.m, dates: state.dates });
        const body = request(), result = await detach(body);
        expect(result.detached).toBe(true); expect(state.links).toEqual([]);
        expect(driveFile.trashed).toBe(true); expect(Drive.trash).toHaveBeenCalledTimes(1);
        expect(JSON.stringify({ m: state.m, dates: state.dates })).toBe(original);
        const calls = (Drive.get as jest.Mock).mock.calls.length;
        expect(await detach(body)).toEqual(result); expect(Drive.get).toHaveBeenCalledTimes(calls);
        expect(Drive.create).not.toHaveBeenCalled(); expect(Drive.reserve).not.toHaveBeenCalled();
    });
    it.each([false, true])('resumes the same request after timeout (external effect = %s)', async effected => {
        ready(); const body = request();
        (Drive.trash as jest.Mock).mockImplementationOnce(async () => {
            if (effected) driveFile.trashed = true;
            throw new Error('secret token timeout');
        });
        await expect(detach(body)).rejects.toThrow('SHORTCUT_NOT_READY');
        expect(state.links[0]).toMatchObject({ ShortcutStatus: 'FAILED', ShortcutId: 'reserved' });
        expect(state.links[0].OperationId).toBeTruthy();
        expect(JSON.parse([...receipts.values()][0].Result).phase).toBe('DETACH_PENDING');
        expect((await detach(body)).detached).toBe(true);
        expect(Drive.trash).toHaveBeenCalledTimes(effected ? 1 : 2);
    });
    it('rolls back link deletion if final receipt persistence fails and resumes from trash readback', async () => {
        ready(); const body = request();
        (Repository.prototype.updateReceipt as jest.Mock).mockRejectedValueOnce(new Error('DB failure'));
        await expect(detach(body)).rejects.toThrow('DB failure');
        expect(state.links).toHaveLength(1); expect(driveFile.trashed).toBe(true);
        expect((await detach(body)).detached).toBe(true); expect(Drive.trash).toHaveBeenCalledTimes(1);
    });
    it('never calls Drive if the durable intent transaction fails', async () => {
        ready(); (Repository.prototype.saveReceipt as jest.Mock).mockRejectedValueOnce(new Error('DB failure'));
        await expect(detach(request())).rejects.toThrow('DB failure');
        expect(state.links[0].OperationId).toBeNull(); expect(Drive.get).not.toHaveBeenCalled();
        expect(Drive.trash).not.toHaveBeenCalled(); expect(receipts.size).toBe(0);
    });
    it.each([403, 404, 429, 500])('retains intent, link and original on shortcut read error %i', async code => {
        ready(); (Drive.get as jest.Mock).mockImplementation(async (_auth, id) => {
            if (id === 'reserved') throw Object.assign(new Error('secret denied'), { code });
            return folder(id);
        });
        await expect(detach(request())).rejects.toThrow('SHORTCUT_NOT_READY');
        expect(state.links).toHaveLength(1); expect(driveFile.trashed).toBe(false);
        expect(Drive.trash).not.toHaveBeenCalled();
    });
    it.each(['id', 'target', 'parent', 'extra-parent', 'owner', 'mime', 'unknown-trash', 'permission'])
        ('does not mutate foreign/uncertain shortcut: %s', async mismatch => {
        ready();
        if (mismatch === 'id') driveFile.id = 'foreign';
        if (mismatch === 'target') driveFile.shortcutDetails.targetId = 'foreign';
        if (mismatch === 'parent') driveFile.parents = ['foreign'];
        if (mismatch === 'extra-parent') driveFile.parents.push('foreign');
        if (mismatch === 'owner') driveFile.appProperties = {};
        if (mismatch === 'mime') driveFile.mimeType = 'application/vnd.google-apps.folder';
        if (mismatch === 'unknown-trash') delete driveFile.trashed;
        if (mismatch === 'permission') driveFile.capabilities = {};
        const before = JSON.stringify(driveFile);
        await expect(detach(request())).rejects.toThrow();
        expect(JSON.stringify(driveFile)).toBe(before); expect(Drive.trash).not.toHaveBeenCalled();
        expect(state.links).toHaveLength(1);
    });
    it('accepts an already trashed owned shortcut without another write', async () => {
        ready(); driveFile.trashed = true; driveFile.capabilities = {};
        expect((await detach(request())).detached).toBe(true); expect(Drive.trash).not.toHaveBeenCalled();
    });
    it('does not claim completion from successful update without confirmed trash readback', async () => {
        ready(); (Drive.trash as jest.Mock).mockResolvedValue(undefined);
        await expect(detach(request())).rejects.toThrow('DRIVE_STATE_UNCERTAIN');
        expect(state.links).toHaveLength(1);
    });
    it.each(['source', 'parent'])('does not write if %s folder is inaccessible', async blocked => {
        ready(); (Drive.get as jest.Mock).mockImplementation(async (_auth, id) => {
            if (id === blocked) throw missing();
            return id === 'reserved' ? driveFile : folder(id);
        });
        await expect(detach(request())).rejects.toThrow('SHORTCUT_NOT_READY');
        expect(Drive.trash).not.toHaveBeenCalled(); expect(state.links).toHaveLength(1);
    });
    it('keeps the link if original folder cannot be confirmed after trash', async () => {
        ready(); (Drive.get as jest.Mock).mockImplementation(async (_auth, id) => {
            if (id === 'source' && driveFile.trashed) throw missing();
            return id === 'reserved' ? driveFile : folder(id);
        });
        await expect(detach(request())).rejects.toThrow('SHORTCUT_NOT_READY');
        expect(state.links).toHaveLength(1); expect(driveFile.trashed).toBe(true);
    });
    it('allows plain unreserved link removal without Google but denies inconsistent READY', async () => {
        state.links = [{ ContractId: 2, ShortcutStatus: 'READY' }];
        await expect(detach(request())).rejects.toThrow('SHORTCUT_NOT_READY');
        state.links[0].ShortcutStatus = 'PENDING';
        expect((await detach(request())).detached).toBe(true); expect(Drive.get).not.toHaveBeenCalled();
    });
    it('blocks new attach/detach and legacy deletion while the original detach can resume', async () => {
        ready(); const body = request(); (Drive.trash as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
        await expect(detach(body)).rejects.toThrow('SHORTCUT_NOT_READY');
        const next = { ...request(), requestId: '56b25916-7420-4a46-b193-3dc1c2aab723' };
        await expect(run(next)).rejects.toThrow('OPERATION_IN_PROGRESS');
        await expect(detach(next)).rejects.toThrow('OPERATION_IN_PROGRESS');
        await expect(Controller.guardMilestone({ id: 10 }, true)).rejects.toThrow('OPERATION_IN_PROGRESS');
        expect((await detach(body)).detached).toBe(true);
    });
    it('rejects tampered payload, changed identity and revoked scope on an unfinished replay', async () => {
        ready(); const body = request(); (Drive.trash as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
        await expect(detach(body)).rejects.toThrow('SHORTCUT_NOT_READY');
        const calls = (Drive.get as jest.Mock).mock.calls.length;
        await expect(detach({ ...body, expectedRevision: 'a'.repeat(64) })).rejects.toThrow('IDEMPOTENCY_CONFLICT');
        await expect(detach(body, user, { projectOurIds: [] })).rejects.toThrow('SCOPE_DENIED');
        state.links[0].ShortcutId = 'different';
        await expect(detach(body)).rejects.toThrow('OPERATION_IN_PROGRESS');
        expect(Drive.get).toHaveBeenCalledTimes(calls);
    });
    it('checks role, agent policy and revision before any detach intent or transport', async () => {
        ready(); const body = request();
        await expect(detach(body, { ...user, systemRoleId: 4 })).rejects.toThrow('ROLE_DENIED');
        const { AGENT_SYSTEM_EMAIL } = require('../../../../setup/Sessions/agentTokenAuth');
        await expect(detach(body, { ...user, systemEmail: AGENT_SYSTEM_EMAIL })).rejects.toThrow('AGENT_DESTRUCTIVE_DENIED');
        await expect(detach({ ...body, expectedRevision: '0'.repeat(64) })).rejects.toThrow('STALE_REVISION');
        expect(Drive.get).not.toHaveBeenCalled(); expect(receipts.size).toBe(0);
    });
    it('fails before auth/transport when a canonical folder is missing', async () => {
        state.m.GdFolderId = null;
        expect((await run(request())).shortcutStatus).toBe('FAILED');
        expect(Drive.reserve).not.toHaveBeenCalled(); expect(Drive.get).not.toHaveBeenCalled();
    });
    it('requires a readable live target and a writable destination folder', () => {
        expect(() => Validator.folder({ ...folder('p'), capabilities: {} }, 'p', true)).toThrow('DRIVE_STATE_UNCERTAIN');
        expect(() => Validator.folder({ ...folder('p'), trashed: true }, 'p')).toThrow('DRIVE_STATE_UNCERTAIN');
        expect(() => Validator.folders('same', 'same')).toThrow('FOLDER_ALIAS');
    });
});
