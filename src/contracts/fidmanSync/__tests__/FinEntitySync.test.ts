import { DatabaseSync } from 'node:sqlite';
import ToolsDb from '../../../tools/ToolsDb';
import { deliverOutboxRow, enqueueFinEntityRefresh, findFinClientIds } from '../FidmanSync';

jest.mock('../../../tools/ToolsDb');

const realFetch = global.fetch;
const keys = ['FIN_SYNC_BASE_URL', 'FIN_SYNC_TOKEN', 'FIDMAN_SYNC_BASE_URL', 'FIDMAN_SYNC_TOKEN'];
const savedEnv = keys.map((key) => process.env[key]);
const row = (fin = true) => ({
    Id: 9, Kind: 'entity.upsert' as const, RefId: 7,
    Payload: fin ? { _recipient: 'fin', entity: { id: 7 }, needs: [{ id: 999 }] }
        : { legacyEntityId: 7, name: 'FIDman snapshot', taxNumber: null },
    Status: 'PENDING' as const, Attempts: 0, SkipReason: null,
});

beforeEach(() => {
    jest.resetAllMocks();
    process.env.FIN_SYNC_BASE_URL = 'https://fin.invalid';
    process.env.FIN_SYNC_TOKEN = 'fin-token';
    process.env.FIDMAN_SYNC_BASE_URL = 'https://fidman.invalid';
    process.env.FIDMAN_SYNC_TOKEN = 'fidman-token';
    global.fetch = jest.fn().mockResolvedValue({ status: 200, json: async () => ({}) });
});
afterEach(() => {
    global.fetch = realFetch;
    keys.forEach((key, i) => savedEnv[i] === undefined ? delete process.env[key] : process.env[key] = savedEnv[i]);
});

it('one scope query includes need-only and employer-only, excludes contractor/engineer-only and deduplicates', async () => {
    const db = new DatabaseSync(':memory:');
    try {
        db.exec(`CREATE TABLE Entities (Id INTEGER PRIMARY KEY);
            CREATE TABLE Needs (Id INTEGER, ClientId INTEGER);
            CREATE TABLE Contracts_Entities (ContractId INTEGER, EntityId INTEGER, ContractRole TEXT);
            INSERT INTO Entities VALUES (1), (2), (3), (4), (5), (6);
            INSERT INTO Needs VALUES (10, 1), (11, 1), (12, 5);
            INSERT INTO Contracts_Entities VALUES (1, 2, 'EMPLOYER'), (2, 2, 'EMPLOYER'),
                (3, 3, 'CONTRACTOR'), (4, 4, 'ENGINEER'), (5, 5, 'EMPLOYER');`);
        const conn = { query: async (sql: string, params: any[]) => [db.prepare(sql).all(...params)] } as any;
        expect(await findFinClientIds(conn)).toEqual([1, 2, 5]);
        expect(await findFinClientIds(conn, 1)).toEqual([1]);
        expect(await findFinClientIds(conn, 2)).toEqual([2]);
        expect(await findFinClientIds(conn, 3)).toEqual([]);
    } finally { db.close(); }
});

it('enqueues only a minimal FIN-marked entity row using the caller connection', async () => {
    const conn = { execute: jest.fn().mockResolvedValue([{ insertId: 91 }]) } as any;
    expect(await enqueueFinEntityRefresh(conn, 7)).toBe(91);
    expect(conn.execute).toHaveBeenCalledTimes(1);
    expect(conn.execute.mock.calls[0][1]).toEqual(['entity.upsert', 7, JSON.stringify({ _recipient: 'fin', entity: { id: 7 } })]);
    expect(global.fetch).not.toHaveBeenCalled();
});

it('FIN delivery rebuilds the full current set once, including focus area codes and needs without actions', async () => {
    const entity = { Id: 7, Name: 'Current name', TaxNumber: null, Address: 'Current address' };
    const first = { ...entity, NeedId: 10, NeedName: 'Water', Description: 'Current description', Status: 'Open' };
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([
        { ...first, FocusAreaName: 'Water action', FocusAreaAlias: 'FENX.01.03' },
        { ...first, FocusAreaName: 'FENX.01.04 Sewage', FocusAreaAlias: 'FENX.01.04' },
        { ...first, FocusAreaName: 'Water action', FocusAreaAlias: 'FENX.01.03' },
        { ...entity, NeedId: 11, NeedName: 'Other need', Description: null, Status: null, FocusAreaName: null },
    ]);
    expect(await deliverOutboxRow(row())).toBe('SENT');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://fin.invalid/api/ps-sync');
    expect(options.headers.Authorization).toBe('Bearer fin-token');
    expect(JSON.parse(options.body)).toEqual({ kind: 'entity.upsert', payload: {
        _recipient: 'fin', entity: { id: 7, name: 'Current name', taxNumber: null, address: 'Current address' },
        needs: [
            { id: 10, name: 'Water', description: 'Current description', status: 'Open', focusAreas: ['FENX.01.03 Water action', 'FENX.01.04 Sewage'] },
            { id: 11, name: 'Other need', description: null, status: null, focusAreas: [] },
        ],
    } });
    expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledTimes(1);
    expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN Needs_FocusAreas'), undefined, [7]);
});

it('a client leaving scope is still delivered with an empty needs set', async () => {
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([{ Id: 7, Name: 'Employer no longer in scope', TaxNumber: null, Address: null, NeedId: null }]);
    expect(await deliverOutboxRow(row())).toBe('SENT');
    expect(JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body).payload.needs).toEqual([]);
});

it('a deleted entity is skipped without HTTP', async () => {
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([]);
    expect(await deliverOutboxRow(row())).toBe('SKIPPED');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(ToolsDb.executeSQL).toHaveBeenCalledWith(expect.stringContaining("SkipReason = 'ENTITY_NOT_FOUND'"), [9]);
});

it('FIDman entity delivery retains its original snapshot and does not query FIN state', async () => {
    expect(await deliverOutboxRow(row(false))).toBe('SENT');
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://fidman.invalid/api/ps-sync');
    expect(options.headers.Authorization).toBe('Bearer fidman-token');
    expect(JSON.parse(options.body)).toEqual({ kind: 'entity.upsert', payload: row(false).Payload });
    expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
});

it.each(['FIN_SYNC_BASE_URL', 'FIN_SYNC_TOKEN'])('missing %s fails through the existing retry mechanism without HTTP', async (key) => {
    delete process.env[key];
    expect(await deliverOutboxRow(row())).toBe('FAILED');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(ToolsDb.executeSQL).toHaveBeenCalledWith(expect.stringContaining('Attempts = Attempts + 1'), [`[FIN] ${key} nie ustawione`, 9]);
});

it('a failed delivery is retryable and the retry reads fresh data', async () => {
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValueOnce([{ Id: 7, Name: 'Before', NeedId: null }])
        .mockResolvedValueOnce([{ Id: 7, Name: 'After', NeedId: 10, NeedName: 'New need' }]);
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 503, statusText: 'Unavailable', text: async () => 'offline' });
    expect(await deliverOutboxRow(row())).toBe('FAILED');
    expect(ToolsDb.executeSQL).toHaveBeenCalledWith(expect.stringContaining('Attempts = Attempts + 1'), ['[FIN] HTTP 503 Unavailable offline', 9]);
    expect(await deliverOutboxRow(row())).toBe('SENT');
    const second = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body).payload;
    expect(second.entity.name).toBe('After');
    expect(second.needs).toEqual([{ id: 10, name: 'New need', description: null, status: null, focusAreas: [] }]);
});

it('FIDman entity delivery keeps its snapshot, destination and token without reading FIN data', async () => {
    expect(await deliverOutboxRow(row(false))).toBe('SENT');
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://fidman.invalid/api/ps-sync');
    expect(options.headers.Authorization).toBe('Bearer fidman-token');
    expect(JSON.parse(options.body)).toEqual({ kind: 'entity.upsert', payload: row(false).Payload });
    expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
});

it.each(['FIN_SYNC_BASE_URL', 'FIN_SYNC_TOKEN'])('missing %s fails only the FIN row', async (key) => {
    delete process.env[key];
    expect(await deliverOutboxRow(row())).toBe('FAILED');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(ToolsDb.executeSQL).toHaveBeenCalledWith(expect.stringContaining("Status = 'FAILED'"), [`[FIN] ${key} nie ustawione`, 9]);
    expect(await deliverOutboxRow(row(false))).toBe('SENT');
});

it.each(['http', 'network', 'database'])('FIN %s errors use existing retry accounting without throwing', async (failure) => {
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([{ Id: 7, Name: 'Client' }]);
    if (failure === 'http') global.fetch = jest.fn().mockResolvedValue({ status: 503, statusText: 'Unavailable', text: async () => 'retry' });
    if (failure === 'network') global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    if (failure === 'database') (ToolsDb.getQueryCallbackAsync as jest.Mock).mockRejectedValue(new Error('database'));
    expect(await deliverOutboxRow(row())).toBe('FAILED');
    expect(ToolsDb.executeSQL).toHaveBeenCalledWith(expect.stringContaining('Attempts = Attempts + 1'), [expect.stringContaining('[FIN] '), 9]);
});
