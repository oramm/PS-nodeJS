jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, addInDb: jest.fn(),
} }));

import ToolsDb from '../../../../tools/ToolsDb';
import Associations from '../../../../letters/associations/LetterCaseAssociationsController';
import LetterCase from '../../../../letters/associations/LetterCase';
import Lifecycle from '../../sharing/MilestoneLifecycleController';

let events: string[], source: number[], stored: number[], missing: number[], conn: any;
const edge = () => new LetterCase({ _letter: { id: 50 }, _case: { id: 200 } as any });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => {
    jest.clearAllMocks(); events = []; source = []; stored = [100]; missing = [];
    conn = {
        query: jest.fn(async (sql: string, params: any[]) => {
            if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: 1 }]]; }
            if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[]]; }
            if (sql.includes('FROM Letters WHERE')) { events.push('letter'); return [[{ Id: 50 }]]; }
            if (sql.includes('FROM Letters_Cases WHERE')) { events.push('stored'); return [stored.map(CaseId => ({ CaseId }))]; }
            if (sql.includes('FROM Cases WHERE')) { events.push('parents'); return [params[0].filter((id: number) => !missing.includes(id)).map((Id: number) => ({ Id, MilestoneId: Id + 1000 }))]; }
            if (sql.includes('FROM MilestoneConsolidationOperations')) {
                events.push('operations'); return [params[0].filter((id: number) => source.includes(id)).map((SourceMilestoneId: number) => ({ SourceMilestoneId }))];
            }
            throw Error('Unexpected SQL');
        }),
        beginTransaction: jest.fn(async () => { events.push('begin'); }),
        commit: jest.fn(async () => { events.push('commit'); }),
        rollback: jest.fn(async () => { events.push('rollback'); }),
        release: jest.fn(() => events.push('release')), destroy: jest.fn(),
    };
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    (ToolsDb.addInDb as jest.Mock).mockImplementation(async (_table, _item, connection, inTransaction) => {
        expect(connection).toBe(conn); expect(inTransaction).toBe(true); events.push('insert');
    });
});

it('adds the edge on the checked connection and commits before unlocking', async () => {
    const item = edge();
    expect(await Associations.add(item)).toBe(item);
    expect(events).toEqual(['lock', 'begin', 'letter', 'stored', 'parents', 'operations', 'insert', 'commit', 'unlock', 'release']);
    expect(ToolsDb.addInDb).toHaveBeenCalledWith('Letters_Cases', expect.objectContaining({ letterId: 50, caseId: 200 }), conn, true);
});

it.each([1100, 1200])('refuses source milestone %s from either stored or requested case', async id => {
    source = [id];
    const item = edge(); item._case = { id: 999 }; item._letter = { id: 999 };
    await expect(Associations.add(item)).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(ToolsDb.addInDb).not.toHaveBeenCalled();
    expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
});

it.each([100, 200])('refuses missing case %s before inserting', async id => {
    missing = [id];
    await expect(Associations.add(edge())).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(ToolsDb.addInDb).not.toHaveBeenCalled();
});

it('refuses a missing letter', async () => {
    const query = conn.query.getMockImplementation();
    conn.query.mockImplementation((sql: string, params: any[]) => sql.includes('FROM Letters WHERE') ? Promise.resolve([[]]) : query(sql, params));
    await expect(Associations.add(edge())).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(ToolsDb.addInDb).not.toHaveBeenCalled();
});

it.each(['letterId', 'caseId'])('rejects invalid %s before acquiring a connection', async field => {
    const item: any = edge(); item[field] = 0;
    await expect(Associations.add(item)).rejects.toBeDefined();
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});

it.each([[{} as any, false], [undefined, true]] as const)('refuses external transaction ownership', async (connection, flag) => {
    await expect(Associations.add(edge(), connection, flag)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
    expect(ToolsDb.addInDb).not.toHaveBeenCalled();
});

it('refuses a nested ordinary writer without obtaining another connection', async () => {
    await Lifecycle.transaction(async () => {
        await expect(Associations.add(edge())).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    });
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
    expect(ToolsDb.addInDb).not.toHaveBeenCalled();
});

it('fails closed on a read error', async () => {
    const query = conn.query.getMockImplementation();
    conn.query.mockImplementation((sql: string, params: any[]) => {
        if (sql.includes('FROM Letters_Cases WHERE')) throw Error('private SQL');
        return query(sql, params);
    });
    await expect(Associations.add(edge())).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(ToolsDb.addInDb).not.toHaveBeenCalled();
    expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
});

it('rolls back an insert failure before unlocking and permits a confirmed retry', async () => {
    (ToolsDb.addInDb as jest.Mock).mockRejectedValueOnce(Error('insert failed'));
    await expect(Associations.add(edge())).rejects.toThrow('insert failed');
    expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
    await Associations.add(edge());
    expect(conn.commit).toHaveBeenCalledTimes(1);
});

it('propagates a commit failure and waits for rollback before unlocking', async () => {
    conn.commit.mockRejectedValueOnce(Error('commit failed'));
    await expect(Associations.add(edge())).rejects.toThrow('commit failed');
    expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
});

it('checks a source created by the preceding queued batch', async () => {
    const entered = deferred(), hold = deferred();
    const batch = Lifecycle.transaction(async () => { entered.resolve(); await hold.promise; source = [1200]; });
    await entered.promise;
    const result = Associations.add(edge());
    await Promise.resolve(); expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
    hold.resolve(); await batch;
    await expect(result).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(ToolsDb.addInDb).not.toHaveBeenCalled();
});

it('keeps the queue locked until commit completes', async () => {
    const entered = deferred(), hold = deferred();
    conn.commit.mockImplementationOnce(async () => { events.push('committing'); entered.resolve(); await hold.promise; events.push('committed'); });
    const first = Associations.add(edge()); await entered.promise;
    const second = Lifecycle.transaction(async () => { events.push('batch'); });
    await Promise.resolve(); expect(events).not.toContain('batch'); expect(events).not.toContain('unlock');
    hold.resolve(); await first; await second;
    expect(events.indexOf('committed')).toBeLessThan(events.indexOf('batch'));
});

it('uses the originally checked scalar IDs if the caller mutates its object while queued', async () => {
    const entered = deferred(), hold = deferred();
    const batch = Lifecycle.transaction(async () => { entered.resolve(); await hold.promise; });
    await entered.promise;
    const item = edge(), result = Associations.add(item);
    item.caseId = 999; item.letterId = 999;
    hold.resolve(); await batch; await result;
    expect(ToolsDb.addInDb).toHaveBeenCalledWith('Letters_Cases', expect.objectContaining({ letterId: 50, caseId: 200 }), conn, true);
});
