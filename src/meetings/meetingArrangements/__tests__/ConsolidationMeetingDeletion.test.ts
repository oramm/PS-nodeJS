jest.mock('../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, deleteFromDb: jest.fn(),
} }));
import ToolsDb from '../../../tools/ToolsDb';
import Meetings from '../../MeetingsController';
import Lifecycle from '../../../contracts/milestones/sharing/MilestoneLifecycleController';

let events: string[], cases: number[], sources: number[], missing: number[], storageFailure: string;
const conn: any = { query: jest.fn(), release: jest.fn(), destroy: jest.fn(),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
beforeEach(() => {
    jest.clearAllMocks(); events = []; cases = [20, 30]; sources = []; missing = []; storageFailure = '';
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: 1 }]]; }
        if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[{ ok: 1 }]]; }
        if (storageFailure && sql.includes(storageFailure)) throw new Error('private storage failure');
        if (sql.includes('FROM MeetingArrangements')) {
            expect(sql).toBe('SELECT DISTINCT CaseId FROM MeetingArrangements WHERE MeetingId = ?');
            expect(params).toEqual([10]); events.push('arrangements');
            return [cases.map(CaseId => ({ CaseId }))];
        }
        if (sql.includes('FROM Cases')) {
            events.push('parents'); return [params[0].filter((id: number) => !missing.includes(id))
                .map((Id: number) => ({ Id, MilestoneId: Id + 100 }))];
        }
        if (sql.includes('FROM MilestoneConsolidationOperations')) {
            events.push('operations'); return [params[0].filter((id: number) => sources.includes(id))
                .map((SourceMilestoneId: number) => ({ SourceMilestoneId }))];
        }
        throw new Error('Unexpected SQL');
    });
    (ToolsDb.deleteFromDb as jest.Mock).mockImplementation(async (table, item) => {
        expect(table).toBe('Meetings'); expect(item.id).toBe(10); events.push('delete-commit');
    });
});
it.each([120, 130])('refuses deletion when any arrangement belongs to source %p', async source => {
    sources = [source];
    await expect(Meetings.deleteById(10)).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS', status: 409 });
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled();
    expect(events).toEqual(['lock', 'arrangements', 'parents', 'operations', 'unlock']);
});
it.each([{ ids: [20, 30] }, { ids: [] }, { ids: [20, 20] }])('preserves ordinary deletion for cases %p', async ({ ids }) => {
    cases = ids; sources = [999]; await Meetings.deleteById(10);
    expect(ToolsDb.deleteFromDb).toHaveBeenCalledTimes(1);
    expect(events[0]).toBe('lock'); expect(events.at(-2)).toBe('delete-commit'); expect(events.at(-1)).toBe('unlock');
});
it('fails closed on an orphaned case instead of omitting the arrangement through a join', async () => {
    missing = [30];
    await expect(Meetings.deleteById(10)).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled(); expect(events.at(-1)).toBe('unlock');
});
it.each([null, undefined, 0, -1, 1.5, NaN, '10', '10 OR 1=1'])('rejects invalid meeting ID %p before access', async id => {
    await expect(Meetings.deleteById(id as any)).rejects.toThrow('positive integer');
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled(); expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled();
});
it.each(['FROM MeetingArrangements', 'FROM Cases', 'FROM MilestoneConsolidationOperations'])('refuses on %s read failure and permits retry', async query => {
    storageFailure = query;
    await expect(Meetings.deleteById(10)).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled(); expect(events.at(-1)).toBe('unlock');
    storageFailure = ''; await Meetings.deleteById(10); expect(ToolsDb.deleteFromDb).toHaveBeenCalledTimes(1);
});
it('releases lifecycle after guard connection failure and permits retry', async () => {
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValueOnce(conn).mockRejectedValueOnce(new Error('private connection failure'));
    await expect(Meetings.deleteById(10)).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled(); expect(events.at(-1)).toBe('unlock');
    await Meetings.deleteById(10); expect(ToolsDb.deleteFromDb).toHaveBeenCalledTimes(1);
});
it('releases lifecycle on deletion failure and permits retry', async () => {
    (ToolsDb.deleteFromDb as jest.Mock).mockRejectedValueOnce(new Error('synthetic delete failure'));
    await expect(Meetings.deleteById(10)).rejects.toThrow('synthetic delete failure');
    expect(events.at(-1)).toBe('unlock'); await Meetings.deleteById(10);
    expect(ToolsDb.deleteFromDb).toHaveBeenCalledTimes(2);
});
it('reads the freshly committed operation after waiting for a batch', async () => {
    let entered!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { entered = r; }); const hold = new Promise<void>(r => { resume = r; });
    const batch = Lifecycle.transaction(async () => { entered(); await hold; sources = [130]; });
    await ready;
    const deletion = Meetings.deleteById(10);
    const denied = expect(deletion).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('arrangements'); resume(); await batch; await denied;
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled();
});
it('keeps a queued batch out until deletion finishes', async () => {
    let entered!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { entered = r; }); const hold = new Promise<void>(r => { resume = r; });
    (ToolsDb.deleteFromDb as jest.Mock).mockImplementationOnce(async () => { entered(); await hold; events.push('delete-commit'); });
    const deletion = Meetings.deleteById(10); await ready;
    const batch = Lifecycle.transaction(async () => { events.push('batch'); });
    expect(events).not.toContain('batch'); resume(); await deletion; await batch;
    expect(events.indexOf('delete-commit')).toBeLessThan(events.indexOf('batch'));
});
it('rejects ordinary deletion inside a batch without acquiring another connection', async () => {
    await expect(Lifecycle.transaction(() => Meetings.deleteById(10))).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1); expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled();
});