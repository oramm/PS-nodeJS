jest.mock('../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, getQueryCallbackAsync: jest.fn(),
    addInDb: jest.fn(), editInDb: jest.fn(), deleteFromDb: jest.fn(), sqlToString: (v: any) => v,
} }));
import ToolsDb from '../../../tools/ToolsDb';
import Controller from '../MeetingArrangementsController';
import Arrangement from '../MeetingArrangement';
import Lifecycle from '../../../contracts/milestones/sharing/MilestoneLifecycleController';

let events: string[], sources: number[], currentCase: number, currentStatus: string, missing: boolean;
const conn: any = { query: jest.fn(), release: jest.fn(), destroy: jest.fn(),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
const item = (caseId = 20) => new Arrangement({ id: 1, _case: { id: caseId }, _parent: { id: 10 }, name: 'synthetic' });
const payload = () => ({ id: 1, caseId: 20, meetingId: 10, name: 'synthetic' });
beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks(); events = []; sources = []; currentCase = 20; currentStatus = 'PLANNED'; missing = false;
    (Controller as any)._instance = undefined;
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: 1 }]]; }
        if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[{ ok: 1 }]]; }
        if (sql.includes('FROM Cases')) {
            events.push('parents');
            return [params[0].filter((id: number) => id !== 999).map((Id: number) => ({ Id, MilestoneId: Id + 100 }))];
        }
        if (sql.includes('FROM MilestoneConsolidationOperations')) {
            events.push('source-check');
            return [params[0].filter((id: number) => sources.includes(id)).map((SourceMilestoneId: number) => ({ SourceMilestoneId }))];
        }
        throw new Error('Unexpected SQL');
    });
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async (sql: string) => {
        expect(sql).toContain('MeetingArrangements.Id=1'); events.push('current');
        return missing ? [] : [{ Id: 1, CaseId: currentCase, MeetingId: 10, Status: currentStatus, Name: 'persisted' }];
    });
    (ToolsDb.addInDb as jest.Mock).mockImplementation(async () => { events.push('insert-commit'); });
    (ToolsDb.editInDb as jest.Mock).mockImplementation(async (_table, value, _conn, _tx, fields) => {
        events.push('update-commit');
        if (fields?.includes('status')) currentStatus = value.status;
    });
    (ToolsDb.deleteFromDb as jest.Mock).mockImplementation(async () => { events.push('delete-commit'); });
});
const calls: [string, () => Promise<unknown>][] = [
    ['add DTO', () => Controller.addFromDto(payload())],
    ['add model', () => Controller.add(item())],
    ['edit DTO', () => Controller.editFromDto(payload())],
    ['edit model', () => Controller.edit(item())],
    ['status', () => Controller.updateStatus(1, 'DISCUSSED')],
    ['delete ID', () => Controller.deleteById(1)],
    ['delete model', () => Controller.delete(item())],
];
it.each(calls)('refuses source %s before mutation', async (_, call) => {
    sources = [120];
    await expect(call()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS', status: 409 });
    expect(events[0]).toBe('lock'); expect(events.at(-1)).toBe('unlock');
    expect(events.some(e => e.endsWith('-commit'))).toBe(false);
});
it.each(calls)('preserves ordinary %s and holds one lock through its commit', async (_, call) => {
    sources = [999]; await call();
    expect(events.filter(e => e === 'lock')).toHaveLength(1);
    expect(events[0]).toBe('lock'); expect(events.at(-1)).toBe('unlock');
    expect(events.filter(e => e.endsWith('-commit'))).toHaveLength(1);
});
it.each(['edit', 'delete'])('reads persisted parent despite forged %s payload', async mode => {
    sources = [120];
    await expect(mode === 'edit' ? Controller.edit(item(30)) : Controller.delete(item(30)))
        .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events.some(e => e.endsWith('-commit'))).toBe(false);
});
it('rejects writing a new parent at a different source', async () => {
    sources = [130];
    await expect(Controller.edit(item(30), undefined, false, ['caseId'])).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
});
it('ignores a non-selected parent and retains partial-update fields', async () => {
    sources = [130]; const value = item(30);
    expect(await Controller.edit(value, undefined, false, ['description'])).toBe(value);
    expect(ToolsDb.editInDb).toHaveBeenCalledWith('MeetingArrangements', value, undefined, false, ['description']);
});
it('guards both UI _case normalization and the resulting actual caseId', async () => {
    sources = [130];
    await expect(Controller.addFromDto({ meetingId: 10, _case: { id: 30, name: 'UI' } } as any))
        .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    await expect(Controller.editFromDto({ id: 1, _case: { id: 30 } } as any))
        .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
});
it('refuses missing arrangement and missing case without mutation', async () => {
    missing = true; await expect(Controller.deleteById(1)).rejects.toThrow('not found');
    missing = false; await expect(Controller.edit(item(999))).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(events.some(e => e.endsWith('-commit'))).toBe(false);
});
it.each([undefined, 0, -1, NaN, '1 OR 1=1', 1.5])('refuses invalid persisted ID %p before any access', async id => {
    await expect(Controller.updateStatus(id as any, 'DISCUSSED')).rejects.toThrow('positive integer');
    expect(events).toEqual([]); expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
});
it.each(['add', 'edit', 'delete'] as const)('refuses unowned external transaction for %s before access', async method => {
    await expect(Controller[method](item(), conn, true)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    await expect(Controller[method](item(), undefined, true)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    await expect(Controller[method](item(), conn, false)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(events).toEqual([]);
});
it('releases after a guard storage failure and permits retry', async () => {
    conn.query.mockImplementationOnce(async () => [[{ ok: 1 }]])
        .mockRejectedValueOnce(new Error('private SQL'));
    await expect(Controller.add(item())).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
    expect(ToolsDb.addInDb).not.toHaveBeenCalled();
    await Controller.add(item()); expect(events).toContain('insert-commit');
});
it('releases after mutation failure and permits retry', async () => {
    (ToolsDb.editInDb as jest.Mock).mockRejectedValueOnce(new Error('injected failure'));
    await expect(Controller.edit(item())).rejects.toThrow('injected failure');
    expect(events.at(-1)).toBe('unlock'); await Controller.edit(item());
});
it('reads the committed source after waiting for a batch', async () => {
    let enter!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { enter = r; }); const hold = new Promise<void>(r => { resume = r; });
    const batch = Lifecycle.transaction(async () => { enter(); await hold; sources = [120]; });
    await ready; const write = Controller.updateStatus(1, 'DISCUSSED');
    const denied = expect(write).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('current'); resume(); await batch; await denied;
    expect(ToolsDb.editInDb).not.toHaveBeenCalled();
});
it('serializes status read-modify-write; a queued stale transition fails', async () => {
    const first = Controller.updateStatus(1, 'DISCUSSED');
    const second = Controller.updateStatus(1, 'DISCUSSED');
    const denied = expect(second).rejects.toThrow('Cannot transition');
    await first; await denied;
    expect(ToolsDb.editInDb).toHaveBeenCalledTimes(1);
});
it.each(calls)('rejects %s inside a batch without a second connection', async (_, call) => {
    await expect(Lifecycle.transaction(call)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(events.some(e => e.endsWith('-commit'))).toBe(false);
});
