import ToolsDb from '../../../tools/ToolsDb';
import * as Sync from '../FidmanSync';
import NeedsController from '../../../financialAidProgrammes/Needs/NeedsController';
import NeedsFocusAreasController from '../../../financialAidProgrammes/NeedsFocusAreas/NeedsFocusAreasController';
import ContractEntityController from '../../ContractEntityController';
import EntitiesController from '../../../entities/EntitiesController';
import { main as backfill } from '../../../scripts/finClientBackfill';

jest.mock('../../../tools/ToolsDb');
jest.mock('../FidmanSync');
jest.mock('../../../setup/loadEnv', () => ({ loadEnv: jest.fn() }));

const conn = { query: jest.fn() } as any;
let inTransaction: boolean;
let committed: boolean;
const need = (clientId = 7) => ({ id: 10, clientId, _client: { id: clientId, name: 'Client' }, name: 'Need', description: '', status: 'NEW' });
const link = () => ({ needId: 10, focusAreaId: 20, _need: need(), _focusArea: { id: 20, name: 'Action', alias: 'A1' }, comment: 'Comment' }) as any;
const enqueued = () => (Sync.enqueueFinEntityRefresh as jest.Mock).mock.calls.map(([connection, id]) => {
    expect(connection).toBe(conn);
    return id;
});

beforeEach(() => {
    jest.resetAllMocks();
    inTransaction = false;
    committed = false;
    conn.query.mockReset().mockResolvedValue([[{ ClientId: 7 }]]);
    (ToolsDb.transaction as jest.Mock).mockImplementation(async (callback) => {
        inTransaction = true;
        try { const result = await callback(conn); committed = true; return result; }
        finally { inTransaction = false; }
    });
    (Sync.enqueueFinEntityRefresh as jest.Mock).mockImplementation(async () => {
        expect(inTransaction).toBe(true);
        expect(committed).toBe(false);
        return 9;
    });
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([]);
    (Sync.findFinClientIds as jest.Mock).mockResolvedValue([7]);
});

it('need creation queues its client in the write transaction', async () => {
    await NeedsController.addNewNeed(need());
    expect(ToolsDb.addInDb).toHaveBeenCalledWith('Needs', expect.objectContaining({ clientId: 7 }), conn, true);
    expect(enqueued()).toEqual([7]);
    expect(committed).toBe(true);
    expect(Sync.tryDeliverAfterCommit).not.toHaveBeenCalled();
});

it('moving a need queues both persisted old and new clients', async () => {
    conn.query.mockResolvedValueOnce([[{ ClientId: 7 }]]).mockResolvedValueOnce([[{ ClientId: 8 }]]);
    await NeedsController.updateNeed(need(8), ['clientId']);
    expect(enqueued()).toEqual([7, 8]);
    expect(ToolsDb.editInDb).toHaveBeenCalledWith('Needs', expect.anything(), conn, true, ['clientId']);
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [10]);
});

it('editing other fields queues the persisted client once, even if the DTO names a different client', async () => {
    await NeedsController.updateNeed(need(8), ['name']);
    expect(enqueued()).toEqual([7]);
});

it('deleting the last need reads its client before deletion and queues it without a scope guard', async () => {
    (ToolsDb.deleteFromDb as jest.Mock).mockImplementation(async () => {
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('ClientId'), [10]);
        expect(Sync.enqueueFinEntityRefresh).not.toHaveBeenCalled();
    });
    await NeedsController.deleteNeed(need(8));
    expect(enqueued()).toEqual([7]);
    expect(ToolsDb.deleteFromDb).toHaveBeenCalledWith('Needs', expect.anything(), conn, true);
    expect(Sync.findFinClientIds).not.toHaveBeenCalled();
});

it.each(['add', 'edit', 'delete'])('focus area %s queues the client read from the need, using the composite key', async (operation) => {
    if (operation === 'add') {
        const saved = await NeedsFocusAreasController.addNewNeedFocusArea(link());
        expect(ToolsDb.addInDb).toHaveBeenCalledWith('Needs_FocusAreas', expect.anything(), conn, true);
        expect(saved.id).toBe('1020');
    } else if (operation === 'edit') {
        await NeedsFocusAreasController.updateNeedFocusArea(link(), ['comment']);
        expect(ToolsDb.executePreparedStmt).toHaveBeenCalledWith(
            'UPDATE Needs_FocusAreas SET Comment = ? WHERE NeedId = ? AND FocusAreaId = ?',
            ['Comment', 10, 20], expect.anything(), conn, true
        );
    } else {
        await NeedsFocusAreasController.deleteNeedFocusArea(link());
        expect(ToolsDb.executePreparedStmt).toHaveBeenCalledWith(
            'DELETE FROM Needs_FocusAreas WHERE NeedId = ? AND FocusAreaId = ?',
            [10, 20], expect.anything(), conn, true
        );
    }
    expect(enqueued()).toEqual([7]);
    expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [10]);
});

it.each([false, true])('adding/replacing contract parties (edit=%s) queues employers only', async (edit) => {
    const contract = { id: 30, _employers: [{ id: 7 }, { id: 8 }, { id: 7 }], _contractors: [{ id: 9 }], _engineers: [{ id: 11 }] } as any;
    await ToolsDb.transaction(async (connection) => {
        if (edit) await ContractEntityController.editAssociations(contract, connection);
        else await ContractEntityController.addAssociations(contract, connection);
    });
    expect(enqueued()).toEqual([7, 8]);
    expect((ToolsDb.addInDb as jest.Mock).mock.calls.every((call) => call[2] === conn)).toBe(true);
});

it.each([true, false])('entity edit queues only an in-scope entity (scope=%s)', async (scope) => {
    (Sync.findFinClientIds as jest.Mock).mockResolvedValue(scope ? [7] : []);
    await EntitiesController.edit({ id: 7, name: 'Client', address: 'New address', taxNumber: '7471917575' });
    expect(Sync.findFinClientIds).toHaveBeenCalledWith(conn, 7);
    expect(enqueued()).toEqual(scope ? [7] : []);
    expect(ToolsDb.editInDb).toHaveBeenCalledWith('Entities', expect.anything(), conn, true, expect.any(Array));
});

it.each([true, false])('GUS name/address acceptance queues only an in-scope entity (scope=%s)', async (scope) => {
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([{ Id: 7, Name: 'Old', GusSnapshot: JSON.stringify({ name: 'Current name', address: 'Current address' }) }]);
    (Sync.findFinClientIds as jest.Mock).mockResolvedValue(scope ? [7] : []);
    expect(await EntitiesController.gusAccept(7, ['name', 'address'])).toMatchObject({ ok: true });
    expect(enqueued()).toEqual(scope ? [7] : []);
    expect(ToolsDb.executeSQL).toHaveBeenCalledWith(expect.stringContaining('UPDATE Entities SET'), [], conn);
});

it('a failed need write never enqueues or commits', async () => {
    (ToolsDb.addInDb as jest.Mock).mockRejectedValue(new Error('write failed'));
    await expect(NeedsController.addNewNeed(need())).rejects.toThrow('write failed');
    expect(enqueued()).toEqual([]);
    expect(committed).toBe(false);
});

it('an outbox write failure prevents a partial commit', async () => {
    (Sync.enqueueFinEntityRefresh as jest.Mock).mockRejectedValue(new Error('outbox failed'));
    await expect(NeedsController.addNewNeed(need())).rejects.toThrow('outbox failed');
    expect(committed).toBe(false);
});

describe('backfill', () => {
    const envKeys = ['DB_HOST', 'DB_NAME', 'FIN_SYNC_BASE_URL', 'FIN_SYNC_TOKEN'];
    let env: (string | undefined)[];
    beforeEach(() => {
        env = envKeys.map((key) => process.env[key]);
        process.env.DB_HOST = 'localhost';
        process.env.DB_NAME = 'test';
        process.env.FIN_SYNC_BASE_URL = 'https://fin.invalid';
        process.env.FIN_SYNC_TOKEN = 'test-token';
        (Sync.findFinClientIds as jest.Mock).mockResolvedValue([7, 8]);
    });
    afterEach(() => envKeys.forEach((key, i) => env[i] === undefined ? delete process.env[key] : process.env[key] = env[i]));

    it.each([{ args: [] }, { args: ['--dry-run'] }])('dry run $args only prints the count and sample, even without FIN configuration', async ({ args }) => {
        delete process.env.FIN_SYNC_BASE_URL;
        delete process.env.FIN_SYNC_TOKEN;
        await backfill(args);
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('DRY-RUN: liczba=2, próbka=7, 8'));
        expect(Sync.findFinClientIds).toHaveBeenCalledWith(conn);
        expect(enqueued()).toEqual([]);
        expect(ToolsDb.addInDb).not.toHaveBeenCalled();
        expect(ToolsDb.executeSQL).not.toHaveBeenCalled();
        expect(Sync.tryDeliverAfterCommit).not.toHaveBeenCalled();
    });
    it('apply enqueues every result of the shared scope query', async () => {
        await backfill(['--apply']);
        expect(enqueued()).toEqual([7, 8]);
        expect(Sync.tryDeliverAfterCommit).not.toHaveBeenCalled();
    });
    it('rejects remote DB without --prod before acquiring a connection', async () => {
        process.env.DB_HOST = 'remote.invalid';
        await expect(backfill(['--dry-run'])).rejects.toThrow('Odmowa');
        expect(ToolsDb.transaction).not.toHaveBeenCalled();
    });
    it('rejects contradictory arguments before acquiring a connection', async () => {
        await expect(backfill(['--apply', '--dry-run'])).rejects.toThrow('Użycie');
        expect(ToolsDb.transaction).not.toHaveBeenCalled();
    });
});
