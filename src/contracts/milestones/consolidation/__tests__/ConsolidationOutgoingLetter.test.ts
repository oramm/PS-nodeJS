jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, transaction: jest.fn(),
} }));
jest.mock('../../../../tools/ToolsGd');

import ToolsDb from '../../../../tools/ToolsDb';
import ToolsGd from '../../../../tools/ToolsGd';
import Letters from '../../../../letters/LettersController';
import LetterRepository from '../../../../letters/LetterRepository';
import LetterCases from '../../../../letters/associations/LetterCaseRepository';
import OurLetter from '../../../../letters/OurLetter';
import IncomingLetter from '../../../../letters/IncomingLetter';
import LetterGdController from '../../../../letters/gdControlers/LetterGdController';
import Lifecycle from '../../sharing/MilestoneLifecycleController';

const deferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(r => { resolve = r; });
    return { promise, resolve };
};
let events: string[], source: boolean, item: any, lock: any, db: any;
const auth = {} as any;
const files = [{ originalname: 'a' }, { originalname: 'b' }] as any;
const run = (attachments = files) => Letters.addNewOurLetter(item, attachments, {} as any, auth);

beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks();
    events = []; source = false;
    const query = jest.fn(async (sql: string, params: any[]) => {
        if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: 1 }]]; }
        if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[]]; }
        if (sql.includes('FROM Cases WHERE')) return [params[0].map((Id: number) => ({ Id, MilestoneId: 1000 + Id }))];
        if (sql.includes('FROM MilestoneConsolidationOperations')) return [source ? [{ SourceMilestoneId: 1100 }] : []];
        throw Error('Unexpected SQL: ' + sql);
    });
    lock = { query, release: jest.fn(() => events.push('release')), destroy: jest.fn(),
        beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
    db = { query };
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(lock);
    (ToolsDb.transaction as jest.Mock).mockImplementation(async action => {
        events.push('begin');
        try { const result = await action(db); events.push('commit'); return result; }
        catch (e) { events.push('rollback'); throw e; }
    });
    jest.spyOn(Letters as any, 'withAuth').mockImplementation(async (callback: any) => {
        events.push('auth'); return callback(Letters.getInstance(), auth);
    });
    jest.spyOn(Letters as any, 'hydrateCreatedCases').mockResolvedValue(undefined);
    jest.spyOn(LetterRepository.prototype, 'addInDb').mockImplementation(async (letter: any, conn: any) => {
        expect(conn).toBe(db); events.push('insert'); letter.id = 50;
    });
    jest.spyOn(LetterRepository.prototype, 'editInDb').mockImplementation(async (_letter, conn) => {
        expect(conn).toBe(db); events.push('edit');
    });
    jest.spyOn(LetterRepository.prototype, 'deleteFromDb').mockImplementation(async () => { events.push('db-cleanup'); });
    jest.spyOn(LetterCases.prototype, 'addInDb').mockImplementation(async association => association);
    (ToolsGd.createFolder as jest.Mock).mockImplementation(async () => { events.push('folder'); return { id: 'folder' }; });
    (ToolsGd.createPermissions as jest.Mock).mockImplementation(async () => { events.push('permissions'); });
    (ToolsGd.createShortcut as jest.Mock).mockImplementation(async () => { events.push('shortcut'); });
    (ToolsGd.uploadFileMulter as jest.Mock).mockImplementation(async () => { events.push('upload'); });
    (ToolsGd.trashFileOrFolder as jest.Mock).mockImplementation(async () => { events.push('gd-cleanup'); });
    item = Object.assign(Object.create(OurLetter.prototype), {
        _cases: [{ id: 100, gdFolderId: 'case-a' }, { id: 101, gdFolderId: 'case-b' }],
        _entitiesMain: [], _entitiesCc: [], creationDate: '2026-09-29', letterFilesCount: 0,
        _letterGdController: Object.assign(Object.create(LetterGdController.prototype), { makeParentFolderGdId: () => 'project' }),
        createLetterFile: jest.fn(async () => { events.push('document'); return { documentId: 'document' }; }),
        makeLetterGdFileController: () => ({ updateTextRunsInNamedRanges: async () => { events.push('text'); } }),
        createNewLetterEvent: jest.fn(async () => { events.push('event'); }),
    });
});

it('rejects a source before auth, DB creation and Google', async () => {
    source = true;
    await expect(run()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).toEqual(['lock', 'unlock', 'release']);
});

it('keeps a single lock beyond DB commit through Google and the event', async () => {
    await run();
    expect(events.filter(e => e === 'lock')).toHaveLength(1);
    expect(events.indexOf('commit')).toBeLessThan(events.indexOf('folder'));
    expect(events.indexOf('event')).toBeLessThan(events.indexOf('unlock'));
    expect(lock.release).toHaveBeenCalledTimes(1);
    expect(events.filter(e => e === 'upload')).toHaveLength(2);
    expect(item.number).toBe(50);
});

it.each(['upload', 'shortcut', 'text'] as const)('waits for slow %s after a sibling failure before cleanup and queued batch', async slow => {
    const started = deferred(), hold = deferred();
    const failure = new Error('effect failed');
    if (slow === 'upload') {
        (ToolsGd.uploadFileMulter as jest.Mock).mockRejectedValueOnce(failure).mockImplementationOnce(async () => {
            started.resolve(); await hold.promise; events.push('slow-end');
        });
    } else if (slow === 'shortcut') {
        (ToolsGd.createShortcut as jest.Mock).mockRejectedValueOnce(failure).mockImplementationOnce(async () => {
            started.resolve(); await hold.promise; events.push('slow-end');
        });
    } else {
        item.makeLetterGdFileController = () => ({ updateTextRunsInNamedRanges: async () => {
            started.resolve(); await hold.promise; events.push('slow-end');
        } });
        (ToolsGd.createShortcut as jest.Mock).mockRejectedValueOnce(failure);
    }
    const result = run().catch(error => error);
    await started.promise;
    const batch = Lifecycle.transaction(async () => { events.push('batch'); });
    await new Promise(resolve => setImmediate(resolve));
    expect(events).not.toContain('gd-cleanup');
    expect(events).not.toContain('unlock');
    expect(events).not.toContain('batch');
    hold.resolve();
    expect(await result).toBe(failure);
    await batch;
    expect(events.indexOf('slow-end')).toBeLessThan(events.indexOf('gd-cleanup'));
    expect(events.indexOf('db-cleanup')).toBeLessThan(events.indexOf('unlock'));
    expect(events.indexOf('unlock')).toBeLessThan(events.indexOf('batch'));
    expect(item.createNewLetterEvent).not.toHaveBeenCalled();
});

it('retains the known folder and lock through permission failure and cleanup', async () => {
    const started = deferred(), hold = deferred();
    (ToolsGd.createPermissions as jest.Mock).mockImplementation(async () => {
        started.resolve(); await hold.promise; throw Error('permission failed');
    });
    const result = run().catch(error => error);
    await started.promise;
    expect(item.gdFolderId).toBe('folder');
    expect(events).not.toContain('unlock');
    expect(events).not.toContain('document');
    hold.resolve();
    expect((await result).message).toBe('permission failed');
    expect(ToolsGd.trashFileOrFolder).toHaveBeenCalledWith(auth, 'folder');
    expect(events.indexOf('db-cleanup')).toBeLessThan(events.indexOf('unlock'));
});

it('awaits failed Google cleanup, still attempts DB cleanup and preserves original failure', async () => {
    const started = deferred(), hold = deferred();
    const failure = new Error('event failed');
    item.createNewLetterEvent.mockRejectedValueOnce(failure);
    (ToolsGd.trashFileOrFolder as jest.Mock).mockImplementation(async () => {
        started.resolve(); await hold.promise; throw Error('cleanup failed');
    });
    const result = run().catch(error => error);
    await started.promise;
    expect(events).not.toContain('unlock');
    hold.resolve();
    expect(await result).toBe(failure);
    expect(events.indexOf('db-cleanup')).toBeLessThan(events.indexOf('unlock'));
});

it('refuses a public outgoing workflow nested inside a batch', async () => {
    await expect(Lifecycle.transaction(() => run())).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(events).not.toContain('auth');
});

it('rechecks source state after waiting behind a batch', async () => {
    const started = deferred(), hold = deferred();
    const batch = Lifecycle.transaction(async () => { started.resolve(); await hold.promise; source = true; });
    await started.promise;
    const result = run().catch(error => error);
    hold.resolve(); await batch;
    expect(await result).toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('auth');
});

it('does not call Google after an insert failure and releases the workflow lock', async () => {
    (LetterRepository.prototype.addInDb as jest.Mock).mockRejectedValueOnce(Error('insert failed'));
    await expect(run()).rejects.toThrow('insert failed');
    expect(events).toContain('rollback');
    expect(events).not.toContain('folder');
    expect(events.at(-2)).toBe('unlock');
});

it('preserves folder identity for the existing incoming caller on permission failure', async () => {
    const incoming = Object.assign(Object.create(IncomingLetter.prototype), {
        _letterGdController: item._letterGdController, number: 'IN/1', creationDate: '2026-09-29',
    });
    (ToolsGd.createPermissions as jest.Mock).mockRejectedValueOnce(Error('permission failed'));
    await expect(incoming.setToMultiStateHandler(auth, files)).rejects.toThrow('permission failed');
    expect(incoming.gdFolderId).toBe('folder');
    expect(ToolsGd.uploadFileMulter).not.toHaveBeenCalled();
});

it('keeps the lock while the final event is pending', async () => {
    const started = deferred(), hold = deferred();
    item.createNewLetterEvent.mockImplementation(async () => { started.resolve(); await hold.promise; });
    const result = run([]);
    await started.promise;
    expect(events).not.toContain('unlock');
    hold.resolve(); await result;
    expect(events).toContain('unlock');
});
