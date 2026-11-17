jest.mock('../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, getQueryCallbackAsync: jest.fn(),
} }));
import ToolsDb from '../../../tools/ToolsDb';
import Controller from '../ScrumboardTaskHoursController';
import Lifecycle from '../../../contracts/milestones/sharing/MilestoneLifecycleController';

let conn: any, events: string[], source: boolean, missing: string, fail: string;
let row: any, snapshot: any;
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => {
    jest.clearAllMocks(); events = []; source = false; missing = ''; fail = '';
    row = { Id: 10, EstimatedHours: '8', HoursMon: '2', HoursTue: '3', HoursWed: null, HoursThu: '4', HoursFri: '1' };
    conn = {
        query: jest.fn(async (sql: string, params: any[]) => {
            if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: 1 }]]; }
            if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[]]; }
            if (sql.includes('SELECT Id, CaseId FROM Tasks')) {
                events.push('task'); expect(params).toEqual([[10]]);
                if (fail === 'task') throw Error('read failed');
                return [missing === 'task' ? [] : [{ Id: 10, CaseId: 20 }]];
            }
            if (sql.includes('FROM Cases')) {
                events.push('case'); expect(params).toEqual([[20]]);
                return [missing === 'case' ? [] : [{ Id: 20, MilestoneId: 30 }]];
            }
            if (sql.includes('FROM MilestoneConsolidationOperations')) {
                events.push('source'); expect(params).toEqual([[30]]);
                return [source ? [{ SourceMilestoneId: 30 }] : []];
            }
            if (sql.startsWith('UPDATE Tasks')) {
                events.push('write'); if (fail === 'write') throw Error('write failed');
                expect(params[params.length - 1]).toBe(10);
                const columns = sql.match(/SET (.*) WHERE/)![1].split(', ');
                columns.forEach((column: string, index: number) => { row[column.split(' =')[0]] = params[index]; });
                return [{}];
            }
            if (sql.includes('SELECT Id, EstimatedHours')) {
                events.push('result'); expect(params).toEqual([10]);
                if (fail === 'result') throw Error('result failed');
                return [[{ ...row }]];
            }
            throw Error('Unexpected SQL: ' + sql);
        }),
        beginTransaction: jest.fn(async () => { events.push('begin'); snapshot = { ...row }; }),
        commit: jest.fn(async () => { events.push('commit'); if (fail === 'commit') throw Error('commit failed'); }),
        rollback: jest.fn(async () => { events.push('rollback'); row = { ...snapshot }; }),
        release: jest.fn(() => events.push('release')), destroy: jest.fn(() => events.push('destroy')),
    };
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async (sql, supplied, params) => {
        expect(supplied).toBe(conn);
        return (await supplied.query(sql, params))[0];
    });
});
it('refuses the persisted source before any hours write or result query', async () => {
    source = true;
    await expect(Controller.updateHours(10, { hoursMon: 9 })).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
});
it('preserves omitted days, zero, null, estimated hours and the existing sum', async () => {
    const result = await Controller.updateHours(10, { hoursMon: 0, hoursTue: null, estimatedHours: 12 });
    expect(result).toEqual({ id: 10, estimatedHours: 12, hoursMon: 0, hoursTue: null, hoursWed: null, hoursThu: 4, hoursFri: 1, weekSum: 5 });
    expect(events).toEqual(['lock', 'begin', 'task', 'case', 'source', 'write', 'result', 'commit', 'unlock', 'release']);
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
});
it('keeps the empty payload read without issuing UPDATE', async () => {
    expect((await Controller.updateHours(10, {})).weekSum).toBe(10);
    expect(events).not.toContain('write');
});
it.each(['task', 'case'])('fails closed for missing %s', async kind => {
    missing = kind;
    await expect(Controller.updateHours(10, { hoursFri: 9 })).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(events).not.toContain('write');
});
it('maps a failed identity read to retryable storage error before writing', async () => {
    fail = 'task';
    await expect(Controller.updateHours(10, { hoursFri: 9 })).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(events).not.toContain('write');
});
it.each(['write', 'result', 'commit'])('holds the lock through rollback after %s failure', async phase => {
    fail = phase;
    await expect(Controller.updateHours(10, { hoursFri: 9 })).rejects.toThrow(phase + ' failed');
    expect(row.HoursFri).toBe('1');
    expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
    fail = ''; await Controller.updateHours(10, { hoursFri: 9 });
    expect(row.HoursFri).toBe(9);
});
it.each([0, -1, NaN, 1.5])('rejects invalid identity %s before connection acquisition', async id => {
    await expect(Controller.updateHours(id, { hoursMon: 9 })).rejects.toBeDefined();
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
it('rejects a nested writer rather than opening a second transaction', async () => {
    await Lifecycle.transaction(async () => {
        await expect(Controller.updateHours(10, { hoursMon: 9 })).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    });
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
    expect(events).not.toContain('write');
});
it('keeps a queued lifecycle operation outside the hours commit', async () => {
    const entered = deferred(), finish = deferred();
    conn.commit.mockImplementationOnce(async () => { events.push('commit-wait'); entered.resolve(); await finish.promise; events.push('commit'); });
    const first = Controller.updateHours(10, { hoursMon: 9 });
    await entered.promise;
    const second = Lifecycle.transaction(async () => { events.push('next-operation'); });
    await Promise.resolve(); expect(events).not.toContain('next-operation');
    finish.resolve(); await Promise.all([first, second]);
    expect(events.indexOf('next-operation')).toBeGreaterThan(events.indexOf('release'));
});
it('re-reads the parent state after a preceding queued operation', async () => {
    const entered = deferred(), finish = deferred();
    const prior = Lifecycle.transaction(async () => { entered.resolve(); await finish.promise; source = true; });
    await entered.promise;
    const next = Controller.updateHours(10, { hoursMon: 9 });
    const rejected = expect(next).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    finish.resolve(); await prior; await rejected;
    expect(events).not.toContain('write');
});
