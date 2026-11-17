jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() } } }));
jest.mock('../../sharing/MilestoneSharingRepository');
jest.mock('../ConsolidationAccessController');
import AccessController from '../ConsolidationAccessController';
import Controller from '../ConsolidationReceiptController';
import Repository from '../../sharing/MilestoneSharingRepository';
import ToolsDb from '../../../../tools/ToolsDb';
import Sharing from '../../sharing/MilestoneSharingController';
import Guard from '../ConsolidationWriteGuardController';
import { ConsolidationMappingError as DomainError } from '../ConsolidationMappingValidator';

const user: any = { enviId: 7, systemRoleId: 1 };
const request = () => ({ requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', previewId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    expectedRevision: 'a'.repeat(64), unitIds: ['cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'] });
const conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), destroy: jest.fn() };
const repo = Repository.prototype;
let stored: Map<string, any>, staged: Map<string, any>, events: string[];
const key = (actor: number, endpoint: string, id: string) => `${actor}|${endpoint}|${id}`;
beforeEach(() => {
    jest.resetAllMocks(); stored = new Map(); staged = new Map(); events = [];
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    (AccessController.getSaved as jest.Mock).mockResolvedValue({});
    (repo.acquire as jest.Mock).mockResolvedValue(true); (repo.release as jest.Mock).mockResolvedValue(undefined);
    conn.beginTransaction.mockImplementation(async () => { staged = new Map(stored); });
    conn.commit.mockImplementation(async () => { stored = new Map(staged); });
    conn.rollback.mockImplementation(async () => { staged = new Map(stored); });
    (repo.receipt as jest.Mock).mockImplementation(async (a, e, r) => { events.push('receipt'); return staged.get(key(a, e, r)); });
    (repo.saveReceipt as jest.Mock).mockImplementation(async (a, e, r, payload, result) => {
        events.push('save'); staged.set(key(a, e, r), { Payload: payload, Result: JSON.stringify(result) });
    });
});
const work = () => ({
    authorize: jest.fn(async () => { events.push('authorize'); }),
    execute: jest.fn(async () => { events.push('execute'); return { operationId: 'op', note: 'ą'.repeat(140000), hours: ['5.25', null, '0.00'] }; }),
});
it('commits full result and replays canonically identical payload without executing or checking stale revision', async () => {
    const first = work(), body = request(), result = await Controller.run(body, user, first);
    expect(events).toEqual(['authorize', 'receipt', 'execute', 'save']);
    expect(first.execute).toHaveBeenCalledWith(conn);
    const replay = work(); replay.execute.mockRejectedValue(new DomainError('STALE_REVISION', 409));
    const again = await Controller.run({ ...body, requestId: body.requestId.toUpperCase(), unitIds: [...body.unitIds].reverse() }, user, replay);
    expect(again).toEqual(result); expect(again.note).toHaveLength(140000);
    expect(replay.authorize).toHaveBeenCalledWith(conn); expect(replay.execute).not.toHaveBeenCalled();
    expect(repo.saveReceipt).toHaveBeenCalledTimes(1); expect(stored.size).toBe(1);
    expect(conn.commit).toHaveBeenCalledTimes(2); expect(repo.release).toHaveBeenCalledTimes(2);
});
it('rejects a changed payload for the same actor/endpoint/key', async () => {
    await Controller.run(request(), user, work()); const next = work();
    await expect(Controller.run({ ...request(), expectedRevision: 'b'.repeat(64) }, user, next)).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(next.execute).not.toHaveBeenCalled(); expect(stored.size).toBe(1);
});
it('scopes receipts by actor and the fixed apply endpoint', async () => {
    await Controller.run(request(), user, work()); await Controller.run(request(), { ...user, enviId: 8 }, work());
    expect(stored.size).toBe(2);
    expect(repo.saveReceipt).toHaveBeenCalledWith(8, 'POST:/milestone-consolidations/apply', request().requestId, expect.any(String), expect.any(Object), conn);
});
it('rechecks current rights before reading or returning a saved receipt', async () => {
    await Controller.run(request(), user, work()); (repo.receipt as jest.Mock).mockClear();
    const next = work(); next.authorize.mockRejectedValue(new DomainError('SCOPE_DENIED', 403));
    await expect(Controller.run(request(), user, next)).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
    expect(repo.receipt).not.toHaveBeenCalled(); expect(next.execute).not.toHaveBeenCalled();
});
it('cannot bypass participant authorization with a successful caller callback, including replay', async () => {
    const scope = { projectOurIds: ['P'] };
    await Controller.run(request(), user, work(), scope);
    expect(AccessController.getSaved).toHaveBeenCalledWith(request().previewId, user, scope, conn);
    (repo.receipt as jest.Mock).mockClear();
    (AccessController.getSaved as jest.Mock).mockRejectedValue(new DomainError('SCOPE_DENIED', 403));
    const next = work();
    await expect(Controller.run(request(), user, next, scope)).rejects.toMatchObject({ code: 'SCOPE_DENIED' });
    expect(next.authorize).not.toHaveBeenCalled(); expect(next.execute).not.toHaveBeenCalled();
    expect(repo.receipt).not.toHaveBeenCalled(); expect(conn.rollback).toHaveBeenCalledTimes(1);
});
it.each([undefined, { ...user, systemRoleId: 4 }, { ...user, systemRoleId: 6 }])('rejects invalid actor before DB %#', async actor => {
    await expect(Controller.run(request(), actor, work())).rejects.toBeInstanceOf(DomainError);
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
it('rejects malformed requests before taking a connection', async () => {
    await expect(Controller.run({ ...request(), injected: true }, user, work())).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
it('rolls back failed execution without saving a receipt and allows retry', async () => {
    const broken = work(); broken.execute.mockRejectedValue(new Error('private SQL'));
    await expect(Controller.run(request(), user, broken)).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
    expect(stored.size).toBe(0); expect(repo.saveReceipt).not.toHaveBeenCalled(); expect(conn.rollback).toHaveBeenCalledTimes(1);
    await Controller.run(request(), user, work()); expect(stored.size).toBe(1);
});
it('rolls back when receipt storage fails after execution', async () => {
    (repo.saveReceipt as jest.Mock).mockRejectedValue(new Error('private SQL'));
    await expect(Controller.run(request(), user, work())).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(conn.commit).not.toHaveBeenCalled(); expect(conn.rollback).toHaveBeenCalledTimes(1);
});
it('rolls back a commit failure and releases the lock', async () => {
    conn.commit.mockRejectedValue(new Error('commit failure'));
    await expect(Controller.run(request(), user, work())).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(stored.size).toBe(0); expect(conn.rollback).toHaveBeenCalledTimes(1); expect(repo.release).toHaveBeenCalledTimes(1);
});
it('refuses lossy results and rolls back before saving', async () => {
    const next: any = work(); next.execute.mockResolvedValue({ lost: undefined });
    await expect(Controller.run(request(), user, next)).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    expect(repo.saveReceipt).not.toHaveBeenCalled(); expect(conn.rollback).toHaveBeenCalledTimes(1);
});
it('does not run work without the lifecycle lock', async () => {
    (repo.acquire as jest.Mock).mockResolvedValue(false); const next = work();
    await expect(Controller.run(request(), user, next)).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(next.authorize).not.toHaveBeenCalled(); expect(conn.beginTransaction).not.toHaveBeenCalled();
    expect(repo.release).not.toHaveBeenCalled(); expect(conn.release).toHaveBeenCalledTimes(1);
});
it('discards a connection after uncertain lock acquisition', async () => {
    (repo.acquire as jest.Mock).mockRejectedValue(new Error('network error'));
    await expect(Controller.run(request(), user, work())).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(conn.destroy).toHaveBeenCalledTimes(1); expect(conn.release).not.toHaveBeenCalled();
});
it('rolls back an uncertain transaction start', async () => {
    conn.beginTransaction.mockRejectedValue(new Error('network error'));
    await expect(Controller.run(request(), user, work())).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(conn.rollback).toHaveBeenCalledTimes(1); expect(repo.receipt).not.toHaveBeenCalled();
});
it('discards the connection when rollback fails', async () => {
    conn.rollback.mockRejectedValue(new Error('rollback error')); const next = work(); next.execute.mockRejectedValue(new Error('SQL'));
    await expect(Controller.run(request(), user, next)).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(conn.destroy).toHaveBeenCalledTimes(1); expect(repo.release).not.toHaveBeenCalled(); expect(conn.release).not.toHaveBeenCalled();
});
it('discards a connection when lock release fails after a successful commit', async () => {
    (repo.release as jest.Mock).mockRejectedValue(new Error('release error'));
    await Controller.run(request(), user, work()); expect(stored.size).toBe(1);
    expect(conn.destroy).toHaveBeenCalledTimes(1); expect(conn.release).not.toHaveBeenCalled();
});
it.each(['receipt','ordinary'])('serializes receipt and ordinary writers in the same queue, %s first', async firstMode => {
    let finish!:()=>void, started!:()=>void;
    const gate=new Promise<void>(resolve=>{finish=resolve;});
    const inside=new Promise<void>(resolve=>{started=resolve;});
    const order:string[]=[];
    const firstAction=async()=>{order.push('first');started();await gate;order.push('first-end');return {};};
    const secondAction=async()=>{order.push('second');return {};};
    const receipt=(action:()=>Promise<object>)=>Controller.run(request(),user,{authorize:async()=>{},execute:action});
    const first=firstMode==='receipt'?receipt(firstAction):Sharing.runExclusive(firstAction);
    await inside;
    const second=firstMode==='receipt'?Sharing.runExclusive(secondAction):receipt(secondAction);
    await new Promise<void>(resolve=>setImmediate(resolve));
    expect(order).toEqual(['first']); expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
    finish(); await Promise.all([first,second]);
    expect(order).toEqual(['first','first-end','second']);
    expect(repo.acquire).toHaveBeenCalledTimes(2); expect(repo.release).toHaveBeenCalledTimes(2);
});
it('rejects a public guarded write inside receipt before acquiring another connection or causing effects', async()=>{
    const effect=jest.fn();
    await expect(Controller.run(request(),user,{authorize:async()=>{},execute:()=>Guard.cases([1],[],effect)})).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR'});
    expect(effect).not.toHaveBeenCalled(); expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalledTimes(1); expect(repo.saveReceipt).not.toHaveBeenCalled();
});
it('rejects a nested receipt instead of starting another transaction', async()=>{
    await expect(Controller.run(request(),user,{authorize:async()=>{},execute:()=>Controller.run(request(),user,work())})).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR'});
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1); expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled(); expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
});
it('rejects receipt under an ordinary writer without borrowing its transaction', async()=>{
    await expect(Sharing.runExclusive(()=>Controller.run(request(),user,work()))).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR'});
    expect(conn.beginTransaction).not.toHaveBeenCalled(); expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
});
it('does not treat inherited context as locked after its owner has finished', async()=>{
    let resume!:()=>void, later!:Promise<void>;
    const gate=new Promise<void>(resolve=>{resume=resolve;});
    await Sharing.runExclusive(async()=>{
        later=(async()=>{await gate;await Sharing.runExclusive(async()=>{});})();
    });
    expect(repo.release).toHaveBeenCalledTimes(1);
    resume(); await later;
    expect(repo.acquire).toHaveBeenCalledTimes(2);expect(repo.release).toHaveBeenCalledTimes(2);
});
it('releases the queue after a pool failure so the next request can proceed',async()=>{
    (ToolsDb.pool.getConnection as jest.Mock).mockRejectedValueOnce(new Error('private pool failure'));
    await expect(Controller.run(request(),user,work())).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR'});
    await Controller.run(request(),user,work()); expect(stored.size).toBe(1);
});
