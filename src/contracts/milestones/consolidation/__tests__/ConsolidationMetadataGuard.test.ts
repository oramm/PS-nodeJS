jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, transaction: jest.fn(),
} }));
import ToolsDb from '../../../../tools/ToolsDb';
import Sharing from '../../sharing/MilestoneSharingController';
import SharingRepository from '../../sharing/MilestoneSharingRepository';
import Lifecycle from '../../sharing/MilestoneLifecycleController';
import Milestones from '../../MilestonesController';
import MilestoneRepository from '../../MilestoneRepository';
import Dates from '../../cases/milestoneDate/MilestoneDatesController';
import DateRepository from '../../cases/milestoneDate/MilestoneDateRepository';

let events: string[], operations: any[];
const conn: any = { query: jest.fn(), release: jest.fn(), destroy: jest.fn(),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
const milestone: any = { id: 10, _type: { id: 5 }, _contract: { id: 1 }, _dates: [] };
const date: any = { id: 20, milestoneId: 10 };
beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks(); events = []; operations = [];
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('o.DestinationMilestoneId')) return [[]];
        if (!sql.includes('FROM MilestoneConsolidationOperations')) throw new Error('Unexpected SQL');
        events.push('source-check');
        return [operations.filter(row => params[0].includes(row.SourceMilestoneId))];
    });
    jest.spyOn(SharingRepository.prototype, 'acquire').mockImplementation(async () => { events.push('lock'); return true; });
    jest.spyOn(SharingRepository.prototype, 'release').mockImplementation(async () => { events.push('unlock'); });
    jest.spyOn(SharingRepository.prototype, 'date').mockResolvedValue({ Id: 20, MilestoneId: 10 });
    jest.spyOn(SharingRepository.prototype, 'snapshot').mockResolvedValue({ m: { Id: 10 }, links: [], revision: null } as any);
    jest.spyOn(Sharing, 'guardMilestone').mockResolvedValue({ links: [] } as any);
    jest.spyOn(Sharing, 'decorate').mockImplementation(async items => { events.push('decorate'); return items; });
    jest.spyOn(Sharing, 'touch').mockImplementation(async () => { events.push('touch'); });
    jest.spyOn(MilestoneRepository.prototype, 'findById').mockResolvedValue(milestone);
    jest.spyOn(Milestones as any, 'editUnsafe').mockImplementation(async () => { events.push('milestone-write'); return milestone; });
    jest.spyOn(Milestones as any, 'deleteUnsafe').mockImplementation(async () => { events.push('milestone-delete'); });
    jest.spyOn(DateRepository.prototype, 'editInDb').mockImplementation(async () => { events.push('date-write'); });
    jest.spyOn(DateRepository.prototype, 'deleteFromDb').mockImplementation(async () => { events.push('date-delete'); });
    (ToolsDb.transaction as jest.Mock).mockImplementation(async action => {
        events.push('begin');
        try { const result = await action(conn); events.push('commit'); return result; }
        catch (e) { events.push('rollback'); throw e; }
    });
});
const calls: [string, () => Promise<unknown>][] = [
    ['milestone edit', () => Milestones.edit(milestone)],
    ['milestone delete', () => Milestones.delete(milestone)],
    ['milestone DTO edit including dates', () => Milestones.editFromDto(10, milestone)],
    ['milestone DTO delete', () => Milestones.deleteFromDto(10, {})],
    ['milestone edit through date', () => Milestones.editThroughDateFromDto(20, { ...date, _milestone: milestone })],
    ['date edit', () => Dates.edit(date)],
    ['date delete', () => Dates.delete(date)],
];
it.each(calls)('denies source %s before any mutation or external effect', async (_, call) => {
    operations = [{ SourceMilestoneId: 10, OperationId: 'private', State: 'COMPLETED' }];
    await expect(call()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS', status: 409 });
    expect(events).not.toContain('begin');
    expect(events).not.toContain('milestone-write'); expect(events).not.toContain('milestone-delete');
    expect(DateRepository.prototype.editInDb).not.toHaveBeenCalled();
    expect(DateRepository.prototype.deleteFromDb).not.toHaveBeenCalled();
    expect(events[events.length - 1]).toBe('unlock');
    expect(SharingRepository.prototype.acquire).toHaveBeenCalledTimes(1);
});
it.each(calls)('allows ordinary %s outside the operation source under one lock', async (_, call) => {
    operations = [{ SourceMilestoneId: 99 }];
    await call();
    expect(events[0]).toBe('lock'); expect(events[events.length - 1]).toBe('unlock');
    expect(events).toContain('source-check');
    expect(SharingRepository.prototype.acquire).toHaveBeenCalledTimes(1);
});
it.each(['edit', 'delete'] as const)('uses the persisted date parent and rejects a forged parent on %s', async method => {
    await expect(Dates[method]({ ...date, milestoneId: 99 })).rejects.toMatchObject({ code: 'DEPENDENCY_CONFLICT' });
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
    expect(conn.query).not.toHaveBeenCalled();
});
it('rejects missing date without mutation', async () => {
    (SharingRepository.prototype.date as jest.Mock).mockResolvedValue(undefined);
    await expect(Dates.edit(date)).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
});
it('fails closed on operation storage failure, then releases the queue', async () => {
    conn.query.mockRejectedValueOnce(new Error('private SQL'));
    await expect(Milestones.edit(milestone)).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
    expect(Milestones['editUnsafe']).not.toHaveBeenCalled();
    await Dates.edit(date);
    expect(events).toContain('commit');
});
it('keeps selected fields, revision touch and commit inside the date lock', async () => {
    const fields = ['description'];
    expect(await Dates.edit(date, undefined, fields)).toBe(date);
    expect(DateRepository.prototype.editInDb).toHaveBeenCalledWith(date, conn, true, fields);
    expect(events).toEqual(['lock', 'source-check', 'begin', 'date-write', 'touch', 'commit', 'decorate', 'unlock']);
});
it('rolls back date failure and permits a following mutation', async () => {
    (DateRepository.prototype.editInDb as jest.Mock).mockRejectedValueOnce(new Error('write failed'));
    await expect(Dates.edit(date)).rejects.toThrow('write failed');
    expect(events).toContain('rollback'); expect(events).not.toContain('commit');
    await Dates.delete(date);
    expect(events).toContain('commit');
});
it('queues a date change behind a lifecycle transaction and checks newly committed source state', async () => {
    let entered!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { entered = r; });
    const hold = new Promise<void>(r => { resume = r; });
    const batch = Lifecycle.transaction(async () => { entered(); await hold; operations = [{ SourceMilestoneId: 10 }]; });
    await ready;
    const change = Dates.edit(date);
    const rejected = expect(change).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('source-check');
    resume(); await batch; await rejected;
    expect(DateRepository.prototype.editInDb).not.toHaveBeenCalled();
});
it.each(calls)('rejects nested ordinary %s inside a batch before opening another connection', async (_, call) => {
    await expect(Lifecycle.transaction(call)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
    expect(conn.rollback).toHaveBeenCalledTimes(1);
});
