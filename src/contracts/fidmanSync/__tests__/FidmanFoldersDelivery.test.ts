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
            return [rows.filter((r) => r.Id === params[0] && ['PENDING', 'FAILED'].includes(r.Status) &&
                !rows.some((newer) => newer.Kind === 'contract.folders' && newer.RefId === params[1] && newer.Id > params[2]))
                .map((r) => ({ ...r }))];
        }),
        release: jest.fn(),
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
    expect(rows[0].Status).toBe('SENT');
    expect(ToolsDb.getPoolConnectionWithTimeout).not.toHaveBeenCalled();
    expect((ToolsDb.executeSQL as jest.Mock).mock.calls[0][0]).not.toContain('AND Status');
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
