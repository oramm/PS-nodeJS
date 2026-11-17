jest.mock('../../../tools/ToolsDb');
import ToolsDb from '../../../tools/ToolsDb';
import Setup from '../../../setup/Setup';
import { deliverOutboxRow, drainFidmanOutbox, tryDeliverAfterCommit } from '../FidmanSync';

const makeRow = (Id = 1, Kind = 'contract.folders'): any => ({
    Id, Kind, RefId: 42, Payload: { legacyContractId: 42, contractFolderId: null, cases: [] },
    Status: 'PENDING', Attempts: 0, SkipReason: null,
});
const supersede = (row: any) => Object.assign(row, { Status: 'SKIPPED', SkipReason: 'SUPERSEDED' });
const response = (status = 200, skipped: any[] = []): any => ({
    status, statusText: 'error', json: async () => ({ skipped }), text: async () => 'error',
});
let rows: any[];
let conn: any;
let fetchMock: jest.SpyInstance;

beforeEach(() => {
    rows = [makeRow()];
    conn = {
        query: jest.fn(async (sql: string, params: any[]) => {
            if (sql.includes('GET_LOCK')) return [[{ Acquired: 1 }]];
            if (sql.includes('RELEASE_LOCK')) return [[{ Released: 1 }]];
            expect(sql).toContain("Status IN ('PENDING', 'FAILED')");
            expect(sql).toContain('NOT EXISTS');
            expect(sql).toContain("sent.Kind = 'contract.upsert' AND sent.RefId = ? AND sent.Status = 'SENT'");
            expect(sql).toContain("pending.Status IN ('PENDING', 'FAILED') AND pending.Attempts < ?");
            expect(params[4]).toBe(params[3]);
            // Komplet czeka, gdy umowa nie ma SENT, a ma wpis jeszcze możliwy do dostarczenia.
            const upserts = rows.filter((r) => r.Kind === 'contract.upsert' && r.RefId === params[3]);
            const contractAllows = upserts.some((r) => r.Status === 'SENT') ||
                !upserts.some((r) => ['PENDING', 'FAILED'].includes(r.Status) && r.Attempts < params[5]);
            return [rows.filter((r) => r.Id === params[0] && ['PENDING', 'FAILED'].includes(r.Status) && contractAllows &&
                !rows.some((newer) => newer.Kind === 'contract.folders' && newer.RefId === params[1] && newer.Id > params[2]))
                .map((r) => ({ ...r }))];
        }),
        release: jest.fn(),
        destroy: jest.fn(),
    };
    (ToolsDb.getPoolConnectionWithTimeout as jest.Mock).mockResolvedValue(conn);
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async (_sql, _conn, params) =>
        rows.filter((r) => r.Id === params[0]).map((r) => ({ ...r })));
    (ToolsDb.executeSQL as jest.Mock).mockImplementation(async (sql: string, params: any[], connection) => {
        const row = rows.find((r) => r.Id === params[params.length - 1]);
        if (row.Kind === 'contract.folders') {
            expect(connection).toBe(conn);
            expect(sql).toContain("AND Status IN ('PENDING', 'FAILED')");
            if (!['PENDING', 'FAILED'].includes(row.Status)) return { affectedRows: 0 };
        }
        if (sql.includes("Status = 'FAILED'")) {
            row.Status = 'FAILED'; row.Attempts++; row.LastError = params[0];
        } else if (sql.includes("Status = 'SKIPPED'")) {
            row.Status = 'SKIPPED'; row.SkipReason = params[0];
        } else row.Status = 'SENT';
        return { affectedRows: 1 };
    });
    jest.spyOn(Setup, 'FidmanSync', 'get').mockReturnValue({ ...Setup.FidmanSync, baseUrl: 'http://fidman.test', token: 'test' });
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response());
});

it('F1 tryDeliverAfterCommit nie wysyła SUPERSEDED', async () => {
    supersede(rows[0]);
    await tryDeliverAfterCommit(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ Status: 'SKIPPED', SkipReason: 'SUPERSEDED' });
    expect(conn.release).toHaveBeenCalledTimes(1);
});

it('F1 drainer nie wysyła starej listy po odłożeniu nowszego wpisu', async () => {
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async () => {
        const stale = { ...rows[0] };
        supersede(rows[0]); rows.push(makeRow(2));
        return [stale];
    });
    expect(await drainFidmanOutbox()).toEqual({ processed: 0, sent: 0, failed: 0, skipped: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rows.map((r) => r.Status)).toEqual(['SKIPPED', 'PENDING']);
});

it('F1 nowszy SENT blokuje wysyłkę starszego FAILED nawet bez SUPERSEDED', async () => {
    rows[0].Status = 'FAILED'; rows.push({ ...makeRow(2), Status: 'SENT' });
    await tryDeliverAfterCommit(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rows.map((r) => r.Status)).toEqual(['FAILED', 'SENT']);
});

it.each(['SENT', 'FAILED', 'SKIPPED'])('F1 spóźniony wynik %s nie zmienia SUPERSEDED', async (result) => {
    fetchMock.mockImplementation(async () => {
        supersede(rows[0]);
        return result === 'FAILED' ? response(500) : response(200, result === 'SKIPPED' ? [{ reason: 'CONTRACT_NOT_IN_FIDMAN' }] : []);
    });
    await tryDeliverAfterCommit(1);
    expect(rows[0]).toMatchObject({ Status: 'SKIPPED', SkipReason: 'SUPERSEDED', Attempts: 0 });
    expect(conn.query).toHaveBeenLastCalledWith('SELECT RELEASE_LOCK(?)', ['fidman:contract.folders:42']);
    expect(conn.release).toHaveBeenCalledTimes(1);
});

it('F1 brak blokady nazwanej pozostawia PENDING bez wysyłki', async () => {
    conn.query.mockResolvedValueOnce([[{ Acquired: 0 }]]);
    await tryDeliverAfterCommit(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ToolsDb.executeSQL).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ Status: 'PENDING', Attempts: 0 });
    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query).toHaveBeenCalledWith('SELECT GET_LOCK(?, ?) AS Acquired', ['fidman:contract.folders:42', 5]);
    expect(conn.release).toHaveBeenCalledTimes(1);
});

it('F1 contract.upsert zachowuje dostawę bez blokady i filtra stanu', async () => {
    rows = [{ ...makeRow(1, 'contract.upsert'), Status: 'SKIPPED' }];
    await tryDeliverAfterCommit(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).kind).toBe('contract.upsert');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).payload).not.toHaveProperty('folderSetVersion');
    expect(rows[0].Status).toBe('SENT');
    expect(ToolsDb.getPoolConnectionWithTimeout).not.toHaveBeenCalled();
    expect((ToolsDb.executeSQL as jest.Mock).mock.calls[0][0]).not.toContain('AND Status');
});

it.each([false, true])('stary komplet 5 po zastosowaniu 7 jest SKIPPED; SUPERSEDED=%s', async (replaced) => {
    rows = [makeRow(5)];
    let appliedVersion = 0;
    fetchMock.mockImplementation(async (_url, options) => {
        const { payload } = JSON.parse(options.body);
        expect(payload).toEqual({ legacyContractId: 42, contractFolderId: null, cases: [], folderSetVersion: 5 });
        // Stara dostawa już trwa; FIDman kończy nowszy komplet przed jej zastosowaniem.
        rows.push({ ...makeRow(7), Status: 'SENT' });
        appliedVersion = 7;
        if (replaced) supersede(rows[0]);
        return payload.folderSetVersion < appliedVersion
            ? response(200, [{ reason: 'STALE_FOLDER_SET' }]) : response();
    });
    expect(await deliverOutboxRow(rows[0])).toBe('SKIPPED');
    expect(rows[0]).toMatchObject({ Status: 'SKIPPED', SkipReason: replaced ? 'SUPERSEDED' : 'STALE_FOLDER_SET', Attempts: 0 });
    expect(rows[1]).toMatchObject({ Id: 7, Status: 'SENT' });
    expect(appliedVersion).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

it.each([false, true])('ponowienie wysyła Id wpisu zamiast numeru w migawce; JSON string=%s', async (asString) => {
    rows = [makeRow(5)];
    const snapshot = { ...rows[0].Payload, folderSetVersion: 99 };
    rows[0].Payload = asString ? JSON.stringify(snapshot) : snapshot;
    fetchMock.mockResolvedValueOnce(response(500)).mockResolvedValueOnce(response());
    expect(await deliverOutboxRow(rows[0])).toBe('FAILED');
    expect(rows[0]).toMatchObject({ Status: 'FAILED', Attempts: 1 });
    expect(await deliverOutboxRow(rows[0])).toBe('SENT');
    expect(rows[0]).toMatchObject({ Status: 'SENT', Attempts: 1 });
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).payload.folderSetVersion)).toEqual([5, 5]);
});

it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('błędne Id %s zatrzymuje budowę ładunku', async (Id) => {
    rows[0].Id = Id;
    expect(await deliverOutboxRow(rows[0])).toBe('FAILED');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ Status: 'FAILED', Attempts: 1, LastError: expect.stringContaining('folderSetVersion') });
});

it('F1 blokada szereguje dwie dostawy tej samej umowy przez cały HTTP', async () => {
    let finishOld!: (value: any) => void;
    let oldStarted!: () => void;
    const started = new Promise<void>((resolve) => { oldStarted = resolve; });
    fetchMock.mockImplementationOnce(() => {
        oldStarted();
        return new Promise((resolve) => { finishOld = resolve; });
    });
    const oldDelivery = tryDeliverAfterCommit(1);
    await started;
    expect(conn.release).not.toHaveBeenCalled();
    supersede(rows[0]); rows.push(makeRow(2));
    let acquireNew!: () => void;
    let newWaiting!: () => void;
    const waiting = new Promise<void>((resolve) => { newWaiting = resolve; });
    const originalQuery = conn.query.getMockImplementation();
    const second = { ...conn, release: jest.fn(), query: jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('GET_LOCK')) {
            newWaiting(); await new Promise<void>((resolve) => { acquireNew = resolve; });
            return [[{ Acquired: 1 }]];
        }
        return originalQuery(sql, params);
    }) };
    (ToolsDb.getPoolConnectionWithTimeout as jest.Mock).mockResolvedValueOnce(second);
    const newDelivery = tryDeliverAfterCommit(2);
    await waiting;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finishOld(response()); await oldDelivery;
    expect(rows[0].SkipReason).toBe('SUPERSEDED');
    conn = second; acquireNew(); await newDelivery;
    expect(rows.map((r) => r.Status)).toEqual(['SKIPPED', 'SENT']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
});

it.each(['fetch', 'body'])('F6 timeout podczas %s zapisuje FAILED i zwalnia blokadę', async (phase) => {
    const controller = new AbortController();
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    const hang = () => new Promise<any>((_resolve, reject) => {
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
        started();
    });
    fetchMock.mockImplementation(async () => phase === 'fetch' ? hang() : { ...response(), json: hang });
    const delivery = tryDeliverAfterCommit(1);
    await pending;
    expect(timeout).toHaveBeenCalledWith(15_000);
    controller.abort(new DOMException('FIDman timeout', 'TimeoutError'));
    await delivery;
    expect(rows[0]).toMatchObject({ Status: 'FAILED', Attempts: 1, LastError: 'FIDman timeout' });
    expect(conn.release).toHaveBeenCalledTimes(1);
});

const folders = (Id: number) => makeRow(Id);
const upsert = (Id: number, Status: string, Attempts = 0): any => ({ ...makeRow(Id, 'contract.upsert'), Status, Attempts });

it.each([['PENDING', 0], ['FAILED', 3], ['FAILED', 9]])('umowa oczekująca (%s, próby %i) bez SENT wstrzymuje komplet', async (Status, Attempts) => {
    rows = [upsert(1, Status, Attempts), folders(2)];
    await tryDeliverAfterCommit(2);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(ToolsDb.executeSQL).not.toHaveBeenCalled();
    expect(rows[1]).toMatchObject({ Status: 'PENDING', Attempts: 0, SkipReason: null });
    expect(conn.release).toHaveBeenCalledTimes(1);
});

it('umowa z wcześniejszym SENT nie wstrzymuje kompletu mimo nowszego FAILED', async () => {
    rows = [upsert(1, 'SENT'), upsert(2, 'FAILED', 1), folders(3)];
    await tryDeliverAfterCommit(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).kind).toBe('contract.folders');
    expect(rows[2].Status).toBe('SENT');
});

it.each([['FAILED', 10], ['SKIPPED', 0]])('umowa martwa albo pominięta (%s, próby %i) nie wstrzymuje kompletu', async (Status, Attempts) => {
    rows = [upsert(1, Status, Attempts), folders(2)];
    await tryDeliverAfterCommit(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows[1].Status).toBe('SENT');
});

it('wpis umowy innej umowy nie wstrzymuje kompletu', async () => {
    rows = [{ ...upsert(1, 'FAILED', 1), RefId: 99 }, folders(2)];
    await tryDeliverAfterCommit(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('drainer dostarcza umowę przed kompletem, gdy oba czekają', async () => {
    rows = [upsert(1, 'PENDING'), folders(2)];
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async () => rows.map((r) => ({ ...r })));
    expect(await drainFidmanOutbox()).toEqual({ processed: 2, sent: 2, failed: 0, skipped: 0 });
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).kind)).toEqual(['contract.upsert', 'contract.folders']);
});

it('drainer zostawia komplet, gdy umowa znów się nie udała', async () => {
    rows = [upsert(1, 'PENDING'), folders(2)];
    fetchMock.mockResolvedValue(response(500));
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async () => rows.map((r) => ({ ...r })));
    expect(await drainFidmanOutbox()).toEqual({ processed: 1, sent: 0, failed: 1, skipped: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows.map((r) => [r.Status, r.Attempts])).toEqual([['FAILED', 1], ['PENDING', 0]]);
});

it('wyczerpana pula połączeń daje null i nie przerywa drainera', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    (ToolsDb.getPoolConnectionWithTimeout as jest.Mock).mockRejectedValue(new Error('pool timeout'));
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async () => rows.map((r) => ({ ...r })));
    await expect(deliverOutboxRow(rows[0])).resolves.toBeNull();
    expect(await drainFidmanOutbox({ batchSize: 1 })).toEqual({ processed: 0, sent: 0, failed: 0, skipped: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
});

it('błąd RELEASE_LOCK niszczy połączenie zamiast zwolnić je do puli', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const original = conn.query.getMockImplementation();
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('RELEASE_LOCK')) throw new Error('connection lost');
        return original(sql, params);
    });
    await expect(deliverOutboxRow(rows[0])).resolves.toBe('SENT');
    expect(conn.destroy).toHaveBeenCalledTimes(1);
    expect(conn.release).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
});
