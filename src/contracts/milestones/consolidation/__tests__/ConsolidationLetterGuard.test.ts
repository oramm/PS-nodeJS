jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, executePreparedStmt: jest.fn(), transaction: jest.fn(),
} }));

import ToolsDb from '../../../../tools/ToolsDb';
import SharingRepository from '../../sharing/MilestoneSharingRepository';
import Lifecycle from '../../sharing/MilestoneLifecycleController';
import Guard from '../ConsolidationWriteGuardController';
import Letters from '../../../../letters/LettersController';
import LetterCases from '../../../../letters/associations/LetterCaseRepository';
import LetterRepository from '../../../../letters/LetterRepository';
import OurLetter from '../../../../letters/OurLetter';
import IncomingLetter from '../../../../letters/IncomingLetter';
import * as Shortcuts from '../../../../letters/resolveShortcutParentId';

const conn: any = { query: jest.fn(), release: jest.fn(), destroy: jest.fn(),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
let events: string[], stored: number[], source: number[];
const letter = (caseIds: number[]): any => ({ id: 50, _cases: caseIds.map(id => ({ id })),
    _entitiesMain: [], _entitiesCc: [] });
const newLetter = (kind: 'our' | 'incoming', caseIds: number[]): any =>
    Object.assign(Object.create(kind === 'our' ? OurLetter.prototype : IncomingLetter.prototype), {
        _cases: caseIds.map(id => ({ id })), _entitiesMain: [], _entitiesCc: [],
        number: kind === 'incoming' ? 'IN/1' : undefined,
    });

beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks();
    events = []; stored = [100]; source = [];
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    conn.beginTransaction.mockImplementation(async () => { events.push('begin'); });
    conn.commit.mockImplementation(async () => { events.push('commit'); });
    conn.rollback.mockImplementation(async () => { events.push('rollback'); });
    conn.release.mockImplementation(() => { events.push('release'); });
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('FROM Letters WHERE')) { events.push('letter'); return [[{ Id: 50 }]]; }
        if (sql.includes('FROM Letters_Cases WHERE')) { events.push('stored'); return [stored.map(CaseId => ({ CaseId }))]; }
        if (sql.includes('FROM Cases WHERE')) { events.push('parents'); return [params[0].map((Id: number) => ({ Id, MilestoneId: Id + 1000 }))]; }
        if (sql.includes('FROM MilestoneConsolidationOperations')) {
            events.push('operations'); return [params[0].filter((id: number) => source.includes(id)).map((SourceMilestoneId: number) => ({ SourceMilestoneId }))];
        }
        throw new Error('unexpected query');
    });
    jest.spyOn(SharingRepository.prototype, 'acquire').mockImplementation(async () => { events.push('lock'); return true; });
    jest.spyOn(SharingRepository.prototype, 'release').mockImplementation(async () => { events.push('unlock'); });
    (ToolsDb.executePreparedStmt as jest.Mock).mockImplementation(async () => { events.push('delete-edge'); });
    jest.spyOn(LetterCases.prototype, 'addInDb').mockImplementation(async association => { events.push('add-edge'); return association; });
    jest.spyOn(LetterRepository.prototype, 'addInDb').mockImplementation(async (item: any) => {
        events.push('insert-letter'); item.id = 50; return item;
    });
});

it.each(['our', 'incoming'] as const)('refuses a source case before creating a %s letter', async kind => {
    source = [1100];
    await expect(Letters.addNew(newLetter(kind, [100]))).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).toEqual(['lock', 'begin', 'parents', 'operations', 'rollback', 'unlock', 'release']);
    expect(LetterRepository.prototype.addInDb).not.toHaveBeenCalled();
    expect(LetterCases.prototype.addInDb).not.toHaveBeenCalled();
});

it.each(['our', 'incoming'] as const)('creates a %s letter and edge on the guarded connection', async kind => {
    const item = newLetter(kind, [100]);
    await Letters.addNew(item);
    expect(events).toEqual(['lock', 'begin', 'parents', 'operations', 'insert-letter', 'add-edge', 'commit', 'unlock', 'release']);
    expect((LetterRepository.prototype.addInDb as jest.Mock).mock.calls[0][1]).toBe(conn);
    expect((LetterCases.prototype.addInDb as jest.Mock).mock.calls[0][1]).toBe(conn);
    expect(item.number).toBe(kind === 'our' ? 50 : 'IN/1');
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
});

it('rolls back an edge failure before unlocking and permits a confirmed retry', async () => {
    (LetterCases.prototype.addInDb as jest.Mock).mockRejectedValueOnce(new Error('edge failed'));
    await expect(Letters.addNew(newLetter('our', [100]))).rejects.toThrow('edge failed');
    expect(events.indexOf('rollback')).toBeLessThan(events.indexOf('unlock'));
    events = [];
    await Letters.addNew(newLetter('our', [100]));
    expect(events).toContain('commit');
});

it('fails closed on a missing case or failed case lookup', async () => {
    conn.query.mockResolvedValueOnce([[]]);
    await expect(Letters.addNew(newLetter('incoming', [100]))).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    conn.query.mockRejectedValueOnce(new Error('private SQL'));
    await expect(Letters.addNew(newLetter('our', [100]))).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    expect(LetterRepository.prototype.addInDb).not.toHaveBeenCalled();
});

it('queues creation behind an active batch and reads the committed source state', async () => {
    let entered!: () => void, resume!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { resume = resolve; });
    const batch = Lifecycle.transaction(async () => { entered(); await hold; source = [1100]; });
    await ready;
    const creation = Letters.addNew(newLetter('incoming', [100]));
    await Promise.resolve();
    expect(events.filter(event => event === 'lock')).toHaveLength(1);
    resume();
    await batch;
    await expect(creation).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(LetterRepository.prototype.addInDb).not.toHaveBeenCalled();
});

it('refuses an inner letter creation under a batch transaction', async () => {
    await expect(Lifecycle.transaction(async () => Letters.addNew(newLetter('our', [100]))))
        .rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(LetterRepository.prototype.addInDb).not.toHaveBeenCalled();
});

it.each([[1100, 'stored'], [1200, 'requested']])('refuses %s source from %s before editing an edge', async id => {
    source = [id];
    await expect(Letters.edit(letter([200]), ['_cases'])).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).toEqual(['lock', 'begin', 'letter', 'stored', 'parents', 'operations', 'rollback', 'unlock', 'release']);
    expect(ToolsDb.executePreparedStmt).not.toHaveBeenCalled();
    expect(LetterCases.prototype.addInDb).not.toHaveBeenCalled();
});

it('uses one guarded connection through edge replacement and commit', async () => {
    await Letters.edit(letter([200]), ['_cases']);
    expect(events).toEqual(['lock', 'begin', 'letter', 'stored', 'parents', 'operations', 'delete-edge', 'add-edge', 'commit', 'unlock', 'release']);
    expect((ToolsDb.executePreparedStmt as jest.Mock).mock.calls[0][3]).toBe(conn);
    expect((LetterCases.prototype.addInDb as jest.Mock).mock.calls[0][1]).toBe(conn);
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
});

it('rolls back an edge failure and releases the lifecycle lock for a retry', async () => {
    (ToolsDb.executePreparedStmt as jest.Mock).mockRejectedValueOnce(new Error('write failed'));
    await expect(Letters.edit(letter([200]), ['_cases'])).rejects.toThrow('write failed');
    expect(events).toContain('rollback');
    expect(events.indexOf('rollback')).toBeLessThan(events.indexOf('unlock'));
    await Letters.edit(letter([200]), ['_cases']);
    expect(events.filter(event => event === 'commit')).toHaveLength(1);
});

it('checks the source after a queued operation commits', async () => {
    let entered!: () => void, resume!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { resume = resolve; });
    const batch = Lifecycle.transaction(async () => { entered(); await hold; source = [1200]; });
    await ready;
    const edit = Letters.edit(letter([200]), ['_cases']);
    await Promise.resolve();
    expect(events.filter(event => event === 'lock')).toHaveLength(1);
    resume();
    await batch;
    await expect(edit).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(ToolsDb.executePreparedStmt).not.toHaveBeenCalled();
});

it('fails closed on a missing letter or stored case and on a storage error', async () => {
    conn.query.mockResolvedValueOnce([[]]);
    await expect(Guard.letterEdit(50, [200], async () => true)).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(events).not.toContain('delete-edge');
    stored = [999];
    conn.query.mockImplementationOnce(async () => [[{ Id: 50 }]])
        .mockImplementationOnce(async () => [[{ CaseId: 999 }]])
        .mockImplementationOnce(async () => [[]]);
    await expect(Guard.letterEdit(50, [200], async () => true)).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    conn.query.mockRejectedValueOnce(new Error('private SQL'));
    await expect(Guard.letterEdit(50, [200], async () => true)).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
});

it('rejects a transferring incoming case before the first Google effect', async () => {
    source = [1100];
    const google = jest.fn();
    await expect(Guard.letterCreationWorkflow([100], google))
        .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(google).not.toHaveBeenCalled();
    expect(events).toEqual(['lock', 'parents', 'operations', 'unlock', 'release']);
});

it('denies the public incoming-letter entry before auth or Google', async () => {
    source = [1100];
    const withAuth = jest.spyOn(Letters as any, 'withAuth');
    const item = newLetter('incoming', [100]);
    item.createLetterFile = jest.fn();
    await expect(Letters.addNewIncomingLetter(item, [], {} as any, {} as any))
        .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(withAuth).not.toHaveBeenCalled();
    expect(item.createLetterFile).not.toHaveBeenCalled();
});

it('keeps one lifecycle lock over incoming Google and its existing DB creation transaction', async () => {
    (ToolsDb.transaction as jest.Mock).mockImplementation(async (action: any) => {
        events.push('begin');
        try {
            const result = await action(conn);
            events.push('commit');
            return result;
        } catch (error) { events.push('rollback'); throw error; }
    });
    await Guard.letterCreationWorkflow([100], async () => {
        events.push('google-upload');
        await Letters.addNew(newLetter('incoming', [100]), true);
        events.push('google-shortcut');
    });
    expect(events).toEqual(['lock', 'parents', 'operations', 'google-upload',
        'begin', 'parents', 'operations', 'insert-letter', 'add-edge', 'commit',
        'google-shortcut', 'unlock', 'release']);
    expect(SharingRepository.prototype.acquire).toHaveBeenCalledTimes(1);
});

it('rejects use of the workflow DB step without owning its outer lock', async () => {
    await expect(Letters.addNew(newLetter('incoming', [100]), true))
        .rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(LetterRepository.prototype.addInDb).not.toHaveBeenCalled();
});

it('queues a batch until the incoming Google cycle finishes', async () => {
    let resume!: () => void;
    const hold = new Promise<void>(resolve => { resume = resolve; });
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const incoming = Guard.letterCreationWorkflow([100], async () => {
        events.push('google-upload'); entered(); await hold;
        events.push('google-finished');
    });
    await ready;
    const batch = Lifecycle.transaction(async () => { events.push('batch'); });
    await Promise.resolve();
    expect(events.filter(event => event === 'lock')).toHaveLength(1);
    resume();
    await incoming;
    await batch;
    expect(events.indexOf('google-finished')).toBeLessThan(events.indexOf('batch'));
});

it('retains the lock while an incoming DB failure is cleaned up', async () => {
    (ToolsDb.transaction as jest.Mock).mockRejectedValueOnce(new Error('db failed'));
    await expect(Guard.letterCreationWorkflow([100], async () => {
        events.push('google-upload');
        try { await Letters.addNew(newLetter('incoming', [100]), true); }
        catch (error) { events.push('google-cleanup'); throw error; }
    })).rejects.toThrow('db failed');
    expect(events.indexOf('google-cleanup')).toBeLessThan(events.indexOf('unlock'));
    expect(SharingRepository.prototype.acquire).toHaveBeenCalledTimes(1);
});

it('runs the public incoming-letter path under one lock from upload through the event', async () => {
    (ToolsDb.transaction as jest.Mock).mockImplementation(async (action: any) => {
        events.push('begin');
        try { const result = await action(conn); events.push('commit'); return result; }
        catch (error) { events.push('rollback'); throw error; }
    });
    jest.spyOn(Letters as any, 'withAuth').mockImplementation(async (callback: any) =>
        callback(Letters.getInstance(), {}));
    jest.spyOn(Letters as any, 'hydrateCreatedCases').mockResolvedValue(undefined);
    jest.spyOn(Letters.getInstance() as any, 'registerApprovedDocumentation').mockResolvedValue(undefined);
    jest.spyOn(Shortcuts, 'createCaseShortcuts').mockImplementation(async () => { events.push('google-shortcuts'); });
    const item = newLetter('incoming', [100]);
    item.createLetterFile = jest.fn(async () => { events.push('google-upload'); return { id: 'doc-50' }; });
    item.setDataToSingleFileState = jest.fn(() => { item.gdDocumentId = 'doc-50'; });
    item.createNewLetterEvent = jest.fn(async () => { events.push('event'); });
    await Letters.addNewIncomingLetter(item, [], {} as any, {} as any);
    expect(events.indexOf('google-upload')).toBeLessThan(events.indexOf('insert-letter'));
    expect(events.indexOf('event')).toBeLessThan(events.indexOf('unlock'));
    expect(SharingRepository.prototype.acquire).toHaveBeenCalledTimes(1);
});
