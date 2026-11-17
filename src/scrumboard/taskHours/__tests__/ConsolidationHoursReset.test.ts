jest.mock('../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, getQueryCallbackAsync: jest.fn(),
} }));
import ToolsDb from '../../../tools/ToolsDb';
import Controller from '../ScrumboardTaskHoursController';
import Lifecycle from '../../../contracts/milestones/sharing/MilestoneLifecycleController';

let conn: any, events: string[], fail: string, operations: number[];
let rows: any[], snapshot: any[];
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => {
    jest.clearAllMocks(); events = []; fail = ''; operations = [];
    rows = [
        { Id: 10, CaseId: 20, MilestoneId: 30, EstimatedHours: 8, HoursMon: 2, HoursTue: 0, HoursWed: null, HoursThu: 4, HoursFri: 1 },
        { Id: 11, CaseId: 21, MilestoneId: 31, EstimatedHours: null, HoursMon: 9, HoursTue: 3, HoursWed: 1, HoursThu: null, HoursFri: 0 },
    ];
    conn = {
        query: jest.fn(async (sql: string) => {
            if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: fail === 'lock' ? 0 : 1 }]]; }
            if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[]]; }
            if (sql.includes('FROM MilestoneConsolidationOperations o')) {
                events.push('source');
                expect(sql.replace(/\s+/g, ' ')).toBe('SELECT o.OperationId, o.SourceMilestoneId FROM MilestoneConsolidationOperations o WHERE EXISTS (SELECT 1 FROM Cases c JOIN Tasks t ON t.CaseId = c.Id WHERE c.MilestoneId = o.SourceMilestoneId) LIMIT 1');
                if (fail === 'source') throw Error('read failed');
                return [operations.filter(id => rows.some(row => row.MilestoneId === id)).map(id => ({ SourceMilestoneId: id }))];
            }
            if (sql.startsWith('UPDATE Tasks')) {
                events.push('write');
                expect(sql.replace(/\s+/g, ' ')).toBe('UPDATE Tasks SET HoursMon = NULL, HoursTue = NULL, HoursWed = NULL, HoursThu = NULL, HoursFri = NULL');
                rows.forEach(row => ['HoursMon', 'HoursTue', 'HoursWed', 'HoursThu', 'HoursFri'].forEach(key => row[key] = null));
                if (fail === 'write') throw Error('write failed');
                return [{}];
            }
            throw Error('Unexpected SQL: ' + sql);
        }),
        beginTransaction: jest.fn(async () => { events.push('begin'); snapshot = rows.map(row => ({ ...row })); }),
        commit: jest.fn(async () => { events.push('commit'); if (fail === 'commit') throw Error('commit failed'); }),
        rollback: jest.fn(async () => { events.push('rollback'); if (fail === 'rollback') throw Error('rollback failed'); rows = snapshot; }),
        release: jest.fn(() => events.push('release')), destroy: jest.fn(() => events.push('destroy')),
    };
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async (sql, supplied) => {
        expect(supplied).toBe(conn); return (await supplied.query(sql))[0];
    });
});
it('refuses the whole reset including unrelated tasks when a source still holds a task', async () => {
    operations = [30]; const before = JSON.stringify(rows);
    await expect(Controller.resetAllDailyHours()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(JSON.stringify(rows)).toBe(before);
    expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    expect(events).toEqual(['lock', 'begin', 'source', 'rollback', 'unlock', 'release']);
});
it('preserves the all-task reset, estimates and identities on one connection', async () => {
    await expect(Controller.resetAllDailyHours()).resolves.toBeUndefined();
    expect(rows.map(row => [row.Id, row.CaseId, row.EstimatedHours])).toEqual([[10, 20, 8], [11, 21, null]]);
    for (const row of rows) for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']) expect(row['Hours' + day]).toBeNull();
    expect(events).toEqual(['lock', 'begin', 'source', 'write', 'commit', 'unlock', 'release']);
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
});
it('does not block on an operation with no remaining source tasks', async () => {
    operations = [99]; await Controller.resetAllDailyHours(); expect(events).toContain('commit');
});
it('keeps an empty task table a successful no-op', async () => {
    rows = []; operations = [30]; await Controller.resetAllDailyHours(); expect(rows).toEqual([]);
});
it('fails closed on a source read error', async () => {
    fail = 'source'; await expect(Controller.resetAllDailyHours()).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(events).not.toContain('write'); expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
});
it.each(['write', 'commit'])('rolls back and releases before retry after %s failure', async phase => {
    const before = JSON.stringify(rows); fail = phase;
    await expect(Controller.resetAllDailyHours()).rejects.toThrow(phase + ' failed');
    expect(JSON.stringify(rows)).toBe(before); expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
    fail = ''; await Controller.resetAllDailyHours(); expect(rows[0].HoursMon).toBeNull();
});
it('does not read or write when the named lock is unavailable', async () => {
    fail = 'lock'; await expect(Controller.resetAllDailyHours()).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(events).toEqual(['lock', 'release']);
});
it('discards a connection after rollback fails', async () => {
    operations = [30]; fail = 'rollback';
    await expect(Controller.resetAllDailyHours()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events.slice(-2)).toEqual(['rollback', 'destroy']); expect(events).not.toContain('release');
});
it.each(['transaction', 'runWithConnection'] as const)('rejects reset nested inside %s', async method => {
    await Lifecycle[method](async () => {
        await expect(Controller.resetAllDailyHours()).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    });
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1); expect(events).not.toContain('source');
});
it('keeps queued lifecycle work outside the reset commit', async () => {
    const entered = deferred(), finish = deferred();
    conn.commit.mockImplementationOnce(async () => { events.push('commit-wait'); entered.resolve(); await finish.promise; events.push('commit'); });
    const first = Controller.resetAllDailyHours(); await entered.promise;
    const second = Lifecycle.transaction(async () => { events.push('next'); });
    await Promise.resolve(); expect(events).not.toContain('next');
    finish.resolve(); await Promise.all([first, second]);
    expect(events.indexOf('next')).toBeGreaterThan(events.indexOf('release'));
});
it('checks sources after the preceding operation has committed', async () => {
    const entered = deferred(), finish = deferred();
    const prior = Lifecycle.transaction(async () => { entered.resolve(); await finish.promise; operations = [31]; });
    await entered.promise; const reset = Controller.resetAllDailyHours();
    const rejected = expect(reset).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    finish.resolve(); await prior; await rejected; expect(events).not.toContain('write');
});
it('keeps queued work outside a delayed rollback', async () => {
    const entered = deferred(), finish = deferred(); operations = [30];
    conn.rollback.mockImplementationOnce(async () => { events.push('rollback-wait'); entered.resolve(); await finish.promise; events.push('rollback'); });
    const rejected = expect(Controller.resetAllDailyHours()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    await entered.promise; const next = Lifecycle.transaction(async () => { events.push('next'); });
    await Promise.resolve(); expect(events).not.toContain('next');
    finish.resolve(); await rejected; await next;
    expect(events.indexOf('next')).toBeGreaterThan(events.indexOf('release'));
});
