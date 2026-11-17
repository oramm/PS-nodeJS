jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, deleteFromDb: jest.fn(),
} }));
jest.mock('../../../../tools/ToolsGd');
import ToolsDb from '../../../../tools/ToolsDb';
import ToolsGd from '../../../../tools/ToolsGd';
import Letters from '../../../../letters/LettersController';
import OurLetter from '../../../../letters/OurLetter';
import Lifecycle from '../../sharing/MilestoneLifecycleController';

const auth = {} as any;
let events: string[], item: any, conn: any, stored: any[], cases: number[], source: boolean;
const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
};
const remove = () => Letters.deleteFromDto(item, auth);

beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks();
    events = []; source = false; cases = [100, 101];
    stored = [{ Id: 50, GdFolderId: 'stored-folder', GdDocumentId: 'stored-document' }];
    item = Object.assign(Object.create(OurLetter.prototype), {
        id: 50, gdFolderId: 'foreign-folder', gdDocumentId: 'foreign-document', _cases: [{ id: 999 }],
    });
    conn = {
        query: jest.fn(async (sql: string, params: any[]) => {
            if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: 1 }]]; }
            if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[]]; }
            if (sql.includes('FROM Letters WHERE')) { expect(params).toEqual([50]); events.push('identity'); return [stored]; }
            if (sql.includes('FROM Letters_Cases WHERE')) { events.push('cases'); return [cases.map(CaseId => ({ CaseId }))]; }
            if (sql.includes('FROM Cases WHERE')) { expect(params).toEqual([cases]); return [cases.map(Id => ({ Id, MilestoneId: 1000 + Id }))]; }
            if (sql.includes('FROM MilestoneConsolidationOperations')) return [source ? [{ SourceMilestoneId: 1101 }] : []];
            throw Error('Unexpected SQL: ' + sql);
        }),
        release: jest.fn(() => events.push('release')), destroy: jest.fn(),
        beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(),
    };
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    (ToolsDb.deleteFromDb as jest.Mock).mockImplementation(async (table, row) => {
        expect(table).toBe('Letters'); expect(row.id).toBe(50); events.push('db-delete');
    });
    (ToolsGd.trashFileOrFolder as jest.Mock).mockImplementation(async () => { events.push('google'); });
    jest.spyOn(Letters, 'createProperLetter').mockImplementation(dto => Object.assign(Object.create(OurLetter.prototype), dto));
    jest.spyOn(Letters as any, 'withAuth').mockImplementation(async (callback: any) => {
        events.push('auth'); return callback(Letters.getInstance(), auth);
    });
});

it.each(['full', 'db', 'google'])('refuses %s deletion using every stored case, ignoring forged DTO cases', async mode => {
    source = true;
    const action = mode === 'full' ? remove : mode === 'db' ? () => Letters.delete(item) : () => Letters.deleteFromGd(item, auth);
    await expect(action()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).toEqual(['lock', 'identity', 'cases', 'unlock', 'release']);
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled();
    expect(ToolsGd.trashFileOrFolder).not.toHaveBeenCalled();
});

it.each(['full', 'google'])('uses persisted document identity for %s deletion', async mode => {
    stored[0].GdFolderId = null;
    if (mode === 'full') await remove(); else await Letters.deleteFromGd(item, auth);
    expect(ToolsGd.trashFileOrFolder).toHaveBeenCalledWith(auth, 'stored-document');
    expect(events.at(-2)).toBe('unlock');
});

it('deletes Google then DB while holding a single named-lock connection', async () => {
    const result = await remove();
    expect(events).toEqual(['lock', 'identity', 'cases', 'auth', 'google', 'db-delete', 'unlock', 'release']);
    expect(result.gdFolderId).toBe('stored-folder');
    expect(ToolsGd.trashFileOrFolder).toHaveBeenCalledWith(auth, 'stored-folder');
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
});

it('rejects missing rows and missing document IDs without trusting the DTO', async () => {
    stored = [];
    await expect(remove()).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    stored = [{ Id: 50, GdFolderId: null, GdDocumentId: null }];
    await expect(remove()).rejects.toThrow('Document must have folderFdId');
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled();
    expect(ToolsGd.trashFileOrFolder).not.toHaveBeenCalled();
});

it('fails closed on storage errors before any effect and permits a new read', async () => {
    conn.query.mockRejectedValueOnce(Error('lock error'));
    await expect(remove()).rejects.toThrow('lock error');
    expect(events).not.toContain('auth');
    await remove();
    expect(events).toContain('db-delete');
});

it('does not delete DB when Google fails', async () => {
    (ToolsGd.trashFileOrFolder as jest.Mock).mockRejectedValueOnce(Error('google failed'));
    await expect(remove()).rejects.toThrow('google failed');
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled();
    expect(events.at(-2)).toBe('unlock');
});

it('reports partial failure after Google succeeds and DB fails', async () => {
    (ToolsDb.deleteFromDb as jest.Mock).mockRejectedValueOnce(Error('db failed'));
    await expect(remove()).rejects.toThrow('db failed');
    expect(events).toContain('google');
    expect(events.at(-2)).toBe('unlock');
    expect(ToolsGd.trashFileOrFolder).toHaveBeenCalledTimes(1);
});

it.each(['google', 'db'])('holds the lock through pending %s and blocks a queued batch', async phase => {
    const entered = deferred(), hold = deferred();
    const effect = phase === 'google' ? ToolsGd.trashFileOrFolder : ToolsDb.deleteFromDb;
    (effect as jest.Mock).mockImplementation(async () => { entered.resolve(); await hold.promise; events.push('effect-end'); });
    const deletion = remove();
    await entered.promise;
    const batch = Lifecycle.transaction(async () => { events.push('batch'); });
    await new Promise(resolve => setImmediate(resolve));
    expect(events).not.toContain('unlock');
    expect(events).not.toContain('batch');
    expect(conn.release).not.toHaveBeenCalled();
    hold.resolve(); await deletion; await batch;
    expect(events.indexOf('effect-end')).toBeLessThan(events.indexOf('unlock'));
    expect(events.indexOf('unlock')).toBeLessThan(events.indexOf('batch'));
});

it('rechecks source state after a preceding batch', async () => {
    const entered = deferred(), hold = deferred();
    const batch = Lifecycle.transaction(async () => { entered.resolve(); await hold.promise; source = true; });
    await entered.promise;
    const deletion = remove().catch(error => error);
    hold.resolve(); await batch;
    expect(await deletion).toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(ToolsGd.trashFileOrFolder).not.toHaveBeenCalled();
});

it('rejects nested public deletion inside a batch before auth or effects', async () => {
    await expect(Lifecycle.transaction(() => remove())).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(events).not.toContain('auth');
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled();
});

it('allows DB-only deletion of a persisted letter with no case edges', async () => {
    cases = [];
    await Letters.delete(item);
    expect(events).toEqual(['lock', 'identity', 'cases', 'db-delete', 'unlock', 'release']);
    expect(ToolsGd.trashFileOrFolder).not.toHaveBeenCalled();
});

it('rejects a missing persisted case and failed identity read before auth', async () => {
    const query = conn.query.getMockImplementation();
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('FROM Cases WHERE')) return [[]];
        return query(sql, params);
    });
    await expect(remove()).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('FROM Letters WHERE')) throw Error('storage detail');
        return query(sql, params);
    });
    await expect(remove()).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(events).not.toContain('auth');
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled();
});

it('releases the lock on auth failure without deleting either side', async () => {
    (Letters as any).withAuth.mockRejectedValueOnce(Error('auth failed'));
    await expect(remove()).rejects.toThrow('auth failed');
    expect(events.at(-2)).toBe('unlock');
    expect(ToolsDb.deleteFromDb).not.toHaveBeenCalled();
    expect(ToolsGd.trashFileOrFolder).not.toHaveBeenCalled();
});

it('rejects invalid identity before acquiring the lifecycle lock', async () => {
    item.id = 0;
    await expect(Letters.delete(item)).rejects.toBeDefined();
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
