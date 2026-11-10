import { createServer } from 'http';
import { AddressInfo } from 'net';
import ToolsDb from '../../../tools/ToolsDb';
import { buildUserUpsert, deliverOutboxRow, drainFidmanOutbox, enqueueFidmanUserPush, enqueueFinUserRefresh, validateFidmanUserSource } from '../FidmanSync';

jest.mock('../../../tools/ToolsDb');

const source = { personId: 42, name: 'Anna', surname: 'Testowa', systemEmail: 'anna@envi.com.pl' };
const row = (fin = true, id = fin ? 2 : 1) => ({
    Id: id, Kind: 'user.upsert' as const, RefId: 42,
    Payload: { ...buildUserUpsert(source, true).payload, ...(fin ? { _recipient: 'fin' } : {}) },
    Status: 'PENDING' as const, Attempts: 0, SkipReason: null,
});
const envKeys = ['FIN_SYNC_BASE_URL', 'FIN_SYNC_TOKEN', 'FIDMAN_SYNC_BASE_URL', 'FIDMAN_SYNC_TOKEN'];
const originalEnv = envKeys.map((key) => process.env[key]);
const realFetch = global.fetch;

beforeEach(() => {
    jest.clearAllMocks();
    // PE6: dostawa do FIN czyta stan z bazy - odpowiedzi z poprzedniego testu nie mogą przeciekać.
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockReset();
    process.env.FIN_SYNC_BASE_URL = 'https://fin.invalid';
    process.env.FIN_SYNC_TOKEN = 'fin-test-token';
    process.env.FIDMAN_SYNC_BASE_URL = 'https://fidman.invalid';
    process.env.FIDMAN_SYNC_TOKEN = 'fidman-test-token';
    (ToolsDb.executeSQL as jest.Mock).mockResolvedValue(undefined);
});
afterEach(() => {
    global.fetch = realFetch;
    envKeys.forEach((key, i) => {
        if (originalEnv[i] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[i];
    });
});

it('FIN nie wymaga podmiotu i nazywa błędy danych', () => {
    expect(validateFidmanUserSource(source, 'fin')).toEqual([]);
    expect(validateFidmanUserSource(source)).toContain('Użytkownik FIDmana musi być przypisany do podmiotu.');
    expect(validateFidmanUserSource({ ...source, systemEmail: '' }, 'fin')).toContain('Użytkownik FIN musi mieć e-mail systemowy.');
});

it('osobne wiersze mają ten sam Kind i RefId, a tylko FIN ma znacznik', async () => {
    const conn = { execute: jest.fn().mockResolvedValue([{ insertId: 1 }]) } as any;
    await enqueueFidmanUserPush(source, true, conn, 'fidman');
    await enqueueFidmanUserPush(source, true, conn, 'fin');
    const payloads = conn.execute.mock.calls.map((call: any[]) => {
        expect(call[1].slice(0, 2)).toEqual(['user.upsert', 42]);
        return JSON.parse(call[1][2]);
    });
    expect(payloads[0]).not.toHaveProperty('_recipient');
    expect(payloads[1]).toHaveProperty('_recipient', 'fin');
});

it('dostawy wybierają osobne URL i Bearer i usuwają _recipient z wire', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, json: async () => ({}) });
    global.fetch = fetchMock as any;
    for (const fin of [false, true]) await deliverOutboxRow(row(fin));
    expect(fetchMock.mock.calls.map((call: any[]) => [call[0], call[1].headers.Authorization])).toEqual([
        ['https://fidman.invalid/api/ps-sync', 'Bearer fidman-test-token'],
        ['https://fin.invalid/api/ps-sync', 'Bearer fin-test-token'],
    ]);
    for (const call of fetchMock.mock.calls as any[]) {
        const body = JSON.parse(call[1].body);
        expect(body.kind).toBe('user.upsert');
        expect(body.payload).not.toHaveProperty('_recipient');
    }
});

it.each([true, false])('awaria FIN=%s nie zmienia wiersza drugiego odbiorcy', async (failFin) => {
    global.fetch = jest.fn(async (url: any) => url === (failFin ? 'https://fin.invalid/api/ps-sync' : 'https://fidman.invalid/api/ps-sync')
        ? { status: 503, statusText: 'Unavailable', text: async () => 'awaria' }
        : { status: 200, json: async () => ({}) }) as any;
    expect(await deliverOutboxRow(row(false))).toBe(failFin ? 'SENT' : 'FAILED');
    expect(await deliverOutboxRow(row(true))).toBe(failFin ? 'FAILED' : 'SENT');
    const calls = (ToolsDb.executeSQL as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls.find(([sql]: any[]) => sql.includes("Status = 'SENT'"))?.[1]).toEqual([failFin ? 1 : 2]);
    const failed = calls.find(([sql]: any[]) => sql.includes("Status = 'FAILED'"))!;
    expect(failed[1][0]).toContain(failFin ? '[FIN] HTTP 503' : 'HTTP 503');
    expect(failed[1][1]).toBe(failFin ? 2 : 1);
});

it.each(['FIN_SYNC_BASE_URL', 'FIN_SYNC_TOKEN'])('brak %s zapisuje FAILED i nie wywołuje HTTP FIN', async (key) => {
    delete process.env[key];
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, json: async () => ({}) });
    global.fetch = fetchMock as any;
    expect(await deliverOutboxRow(row(true))).toBe('FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ToolsDb.executeSQL).toHaveBeenCalledWith(expect.stringContaining("Status = 'FAILED'"), [`[FIN] ${key} nie ustawione`, 2]);
    expect(await deliverOutboxRow(row(false))).toBe('SENT');
});

it('drainer obejmuje FIN tym samym limitem prób', async () => {
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([row()]);
    global.fetch = jest.fn().mockResolvedValue({ status: 200, json: async () => ({}) }) as any;
    expect(await drainFidmanOutbox({ maxAttempts: 3 })).toMatchObject({ sent: 1, processed: 1 });
    expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledWith(expect.stringContaining('Attempts < ?'), undefined, [3, 50]);
});

it('prawdziwy fetch dostarcza FIN do lokalnej atrapy HTTP', async () => {
    let received: any;
    const server = createServer(async (request, response) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        received = { method: request.method, path: request.url, auth: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) };
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ created: 1, updated: 0, skipped: [] }));
    });
    try {
        await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
        process.env.FIN_SYNC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        global.fetch = realFetch;
        expect(await deliverOutboxRow(row())).toBe('SENT');
        const upsert = buildUserUpsert(source, true);
        expect(received).toEqual({ method: 'POST', path: '/api/ps-sync', auth: 'Bearer fin-test-token', body: { ...upsert, payload: { ...upsert.payload, sbAgentKeyHash: null } } });
    } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
});

describe('PE6: skrót klucza agenta z Dostępów SB w koncie dla FIN', () => {
    const HASH = 'ab'.repeat(32);
    const sent = (fetchMock: jest.Mock) => fetchMock.mock.calls.map((call: any[]) => JSON.parse(call[1].body).payload);
    // Stan bazy PS czytany przy dostawie: dostęp do FIN (PersonAccounts) i skrót klucza (SbAccess ACTIVE).
    const ps = (stan: { fin?: number | null; active?: number; hash?: string | null }) =>
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async (sql: string) =>
            sql.includes('FROM PersonAccounts') ? (stan.fin == null ? [] : [{ fin: stan.fin, active: stan.active ?? 1 }])
                : sql.includes('FROM SbAccess') ? (stan.hash ? [{ hash: stan.hash }] : []) : undefined);
    const ok = () => jest.fn().mockResolvedValue({ status: 200, json: async () => ({}) });

    it('FIN dostaje aktualny skrót (tylko wpis ACTIVE), FIDman nie dostaje pola', async () => {
        const fetchMock = ok();
        global.fetch = fetchMock as any;
        ps({ fin: 1, hash: HASH });
        expect(await deliverOutboxRow(row(true))).toBe('SENT');
        expect(await deliverOutboxRow(row(false))).toBe('SENT');
        const [fin, fidman] = sent(fetchMock);
        expect(fin).toMatchObject({ enabled: true, sbAgentKeyHash: HASH });
        expect(fidman).not.toHaveProperty('sbAgentKeyHash');
        expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledWith(expect.stringContaining("StatusCode = 'ACTIVE'"), undefined, [42]);
    });

    it('brak wpisu ACTIVE = null; dostęp do FIN wyłączony w PS = enabled false i null, choć stary wpis mówi „włączony”', async () => {
        const fetchMock = ok();
        global.fetch = fetchMock as any;
        ps({ fin: 1, hash: null });
        await deliverOutboxRow(row(true));
        ps({ fin: 0, hash: HASH });
        await deliverOutboxRow(row(true));
        expect(sent(fetchMock).map((p: any) => [p.enabled, p.sbAgentKeyHash])).toEqual([[true, null], [false, null]]);
    });

    it('konto PS wyłączone (IsActive = 0) przy zostawionym dostępie do FIN = enabled false i pusty skrót; włączone z powrotem = dostęp wraca', async () => {
        const fetchMock = ok();
        global.fetch = fetchMock as any;
        ps({ fin: 1, active: 0, hash: HASH });
        await deliverOutboxRow(row(true));
        ps({ fin: 1, active: 1, hash: HASH });
        await deliverOutboxRow(row(true));
        expect(sent(fetchMock).map((p: any) => [p.enabled, p.sbAgentKeyHash])).toEqual([[false, null], [true, HASH]]);
    });

    it('wyścig: stan zmienił się w trakcie dostawy - FIN dostaje jeszcze bieżący stan', async () => {
        let blokada = false;
        const fetchMock = jest.fn(async () => { blokada = true; return { status: 200, json: async () => ({}) }; });
        global.fetch = fetchMock as any;
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async (sql: string) =>
            sql.includes('FROM PersonAccounts') ? [{ fin: 1, active: 1 }] : sql.includes('FROM SbAccess') ? (blokada ? [] : [{ hash: HASH }]) : undefined);
        expect(await deliverOutboxRow(row(true))).toBe('SENT');
        expect(sent(fetchMock).map((p: any) => p.sbAgentKeyHash)).toEqual([HASH, null]);
        // Kontrola: bez zmiany w trakcie jedna wysyłka.
        fetchMock.mockClear();
        await deliverOutboxRow(row(true));
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('zmiana w Dostępach SB kolejkuje konto do FIN tylko u osoby z dostępem do FIN', async () => {
        const conn = { execute: jest.fn().mockResolvedValue([{ insertId: 7 }]) } as any;
        const load = jest.fn().mockResolvedValue(source);
        ps({ fin: null });
        expect(await enqueueFinUserRefresh(conn, 42, load)).toBeUndefined();
        expect(load).not.toHaveBeenCalled();
        expect(conn.execute).not.toHaveBeenCalled();

        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockReset();
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValueOnce([{ fin: 1 }]);
        expect(await enqueueFinUserRefresh(conn, 42, load)).toBe(7);
        expect(JSON.parse(conn.execute.mock.calls[0][1][2])).toMatchObject({ _recipient: 'fin', enabled: true, legacyPersonId: 42 });
    });

    it('odebranie klucza przechodzi mimo za długiego nazwiska (przycięte); nowy klucz z takimi danymi - nie', async () => {
        const conn = { execute: jest.fn().mockResolvedValue([{ insertId: 8 }]) } as any;
        const load = jest.fn().mockResolvedValue({ ...source, surname: 'N'.repeat(40) });
        ps({ fin: 1, hash: null });
        expect(await enqueueFinUserRefresh(conn, 42, load)).toBe(8);
        expect(JSON.parse(conn.execute.mock.calls[0][1][2]).surname).toBe('N'.repeat(32));
        ps({ fin: 1, hash: HASH });
        const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(await enqueueFinUserRefresh(conn, 42, load)).toBeUndefined();
        expect(conn.execute).toHaveBeenCalledTimes(1);
        err.mockRestore();
    });
});
