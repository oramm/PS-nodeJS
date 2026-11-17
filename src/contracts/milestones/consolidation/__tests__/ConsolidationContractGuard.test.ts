jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, transaction: jest.fn(),
} }));
import ToolsDb from '../../../../tools/ToolsDb';
import Contracts from '../../../ContractsController';
import SharingRepository from '../../sharing/MilestoneSharingRepository';
import Lifecycle from '../../sharing/MilestoneLifecycleController';

let events: string[], sources: number[], rows: any[];
let arrangements: { contractId: number; CaseId: number }[], caseSources: number[], missingCases: number[];
const conn: any = { query: jest.fn(), release: jest.fn(), destroy: jest.fn(),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
const item: any = { id: 1 };
beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks(); events = []; sources = []; arrangements = []; caseSources = []; missingCases = [];
    rows = [{ Id: 1, OurIdRelated: null }, { Id: 2, OurIdRelated: 'OWN/1' }, { Id: 3, OurIdRelated: 'OTHER' }];
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('o.DestinationMilestoneId')) return [[]];
        if (sql.includes('FROM MeetingArrangements a')) {
            expect(sql).toContain('JOIN Meetings m ON m.Id = a.MeetingId');
            expect(sql).toContain('JOIN Contracts c ON c.Id = m.ContractId');
            const group = sql.includes('OR c.OurIdRelated = (SELECT OurId FROM OurContractsData WHERE Id = ?)');
            expect(params).toEqual(group ? [1, 1] : [1]); events.push('meeting-cases');
            const ids = rows.filter(r => r.Id === params[0] || (group && r.OurIdRelated === 'OWN/1')).map(r => r.Id);
            return [arrangements.filter(a => ids.includes(a.contractId)).map(a => ({ CaseId: a.CaseId }))];
        }
        if (sql.includes('SELECT Id, MilestoneId FROM Cases')) {
            events.push('case-parents');
            return [params[0].filter((id: number) => !missingCases.includes(id)).map((Id: number) => ({ Id, MilestoneId: Id + 100 }))];
        }
        if (sql.includes('WHERE SourceMilestoneId IN (?)')) {
            events.push('case-operations');
            return [params[0].filter((id: number) => caseSources.includes(id)).map((SourceMilestoneId: number) => ({ SourceMilestoneId }))];
        }
        if (!sql.includes('JOIN Milestones m ON m.Id = o.SourceMilestoneId') || !sql.includes('JOIN Contracts c ON c.Id = m.ContractId')) throw new Error('Unexpected SQL');
        events.push('source-check');
        const group = sql.includes('OR c.OurIdRelated = (SELECT OurId FROM OurContractsData WHERE Id = ?)');
        expect(params).toEqual(group ? [1, 1] : [1]);
        return [rows.filter(r => r.Id === params[0] || (group && r.OurIdRelated === 'OWN/1')).filter(r => sources.includes(r.Id))];
    });
    jest.spyOn(SharingRepository.prototype, 'acquire').mockImplementation(async () => { events.push('lock'); return true; });
    jest.spyOn(SharingRepository.prototype, 'release').mockImplementation(async () => { events.push('unlock'); });
    jest.spyOn(SharingRepository.prototype, 'contracts').mockImplementation(async () => [rows[0]]);
    jest.spyOn(SharingRepository.prototype, 'moveGroup').mockImplementation(async () => rows.slice(0, 2));
    jest.spyOn(SharingRepository.prototype, 'contractLinks').mockResolvedValue([]);
    jest.spyOn(Contracts as any, 'deleteUnsafe').mockImplementation(async () => { events.push('delete'); return item; });
    jest.spyOn(Contracts as any, 'moveToProjectUnsafe').mockImplementation(async () => { events.push('move'); return item; });
    jest.spyOn(Contracts as any, 'withAuth').mockImplementation(async (action: any) => { events.push('auth'); return action({}, {}); });
});
const calls: [string, () => Promise<unknown>][] = [
    ['delete', () => Contracts.delete(item)],
    ['delete with auth', () => Contracts.deleteWithAuth(item)],
    ['move', () => Contracts.moveToProject(1, 'NEW', {} as any)],
    ['move with auth', () => Contracts.moveToProjectWithAuth(1, 'NEW')],
];
it.each(calls)('rejects source %s before auth, SQL mutation or Google', async (_, call) => {
    sources = [1];
    await expect(call()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS', status: 409 });
    expect(events).toEqual(['lock', 'source-check', 'unlock']);
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
});
it.each(calls)('allows unrelated ordinary %s with one lifecycle lock', async (_, call) => {
    sources = [3];
    expect(await call()).toBe(item);
    expect(events[0]).toBe('lock'); expect(events.at(-1)).toBe('unlock');
    expect(SharingRepository.prototype.acquire).toHaveBeenCalledTimes(1);
});
it.each(calls.slice(2))('rejects %s when only a related contract owns the source', async (_, call) => {
    sources = [2];
    await expect(call()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).toEqual(['lock', 'source-check', 'unlock']);
});
it('does not extend a single contract deletion to its related contracts', async () => {
    sources = [2]; await Contracts.delete(item); expect(events).toContain('delete');
});
it('preserves the existing shared-contract refusal', async () => {
    (SharingRepository.prototype.contractLinks as jest.Mock).mockResolvedValue([{ MilestoneId: 10 }]);
    await expect(Contracts.delete(item)).rejects.toMatchObject({ code: 'DEPENDENCY_CONFLICT' });
    expect(events).not.toContain('delete');
});
it('fails closed on storage error and permits a later retry', async () => {
    conn.query.mockRejectedValueOnce(new Error('private SQL'));
    await expect(Contracts.deleteWithAuth(item)).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
    expect(events).not.toContain('auth'); await Contracts.delete(item); expect(events).toContain('delete');
});
it('rejects missing and invalid IDs without an effect', async () => {
    await expect(Contracts.delete({} as any)).rejects.toBeDefined();
    expect(events).toEqual([]);
    (SharingRepository.prototype.contracts as jest.Mock).mockResolvedValue([]);
    await expect(Contracts.delete(item)).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(events).not.toContain('delete');
});
it('retains the lock through the effect and recovers after its failure', async () => {
    (Contracts['deleteUnsafe'] as jest.Mock).mockImplementationOnce(async () => {
        expect(events).not.toContain('unlock'); throw new Error('effect failed');
    });
    await expect(Contracts.delete(item)).rejects.toThrow('effect failed');
    expect(events.at(-1)).toBe('unlock'); await Contracts.delete(item); expect(events).toContain('delete');
});
it('reads the newly committed source after a queued batch', async () => {
    let enter!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { enter = r; });
    const hold = new Promise<void>(r => { resume = r; });
    const batch = Lifecycle.transaction(async () => { enter(); await hold; sources = [2]; });
    await ready;
    const move = Contracts.moveToProjectWithAuth(1, 'NEW');
    const rejected = expect(move).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('source-check'); resume(); await batch; await rejected;
    expect(events).not.toContain('auth'); expect(events).not.toContain('move');
});
it.each(calls)('rejects nested %s in batch without a second connection', async (_, call) => {
    await expect(Lifecycle.transaction(call)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
    expect(conn.rollback).toHaveBeenCalledTimes(1); expect(events).not.toContain('auth');
});

it.each(calls.slice(0, 2))('refuses %s when the meeting has an arrangement at a source in another contract', async (_, call) => {
    arrangements = [{ contractId: 1, CaseId: 20 }, { contractId: 1, CaseId: 30 }]; caseSources = [130];
    await expect(call()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS', status: 409 });
    expect(events).toEqual(['lock', 'source-check', 'meeting-cases', 'case-parents', 'case-operations', 'unlock']);
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
});
it('does not include meetings owned by an unrelated contract', async () => {
    arrangements = [{ contractId: 2, CaseId: 30 }]; caseSources = [130];
    await Contracts.delete(item); expect(events).toContain('delete'); expect(events).not.toContain('case-parents');
});
it('allows ordinary meetings and deduplicates repeated arrangements', async () => {
    arrangements = [{ contractId: 1, CaseId: 20 }, { contractId: 1, CaseId: 20 }];
    await Contracts.delete(item); expect(events).toContain('delete');
    expect(conn.query).toHaveBeenCalledWith('SELECT Id, MilestoneId FROM Cases WHERE Id IN (?)', [[20]]);
});
it('fails closed when a meeting arrangement points at a missing case', async () => {
    arrangements = [{ contractId: 1, CaseId: 20 }]; missingCases = [20];
    await expect(Contracts.deleteWithAuth(item)).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(events).not.toContain('auth'); expect(events).not.toContain('delete'); expect(events.at(-1)).toBe('unlock');
});
it.each(['FROM MeetingArrangements a', 'SELECT Id, MilestoneId FROM Cases', 'WHERE SourceMilestoneId IN (?)'])(
    'refuses a failed %s read before auth and allows retry', async query => {
        arrangements = [{ contractId: 1, CaseId: 20 }];
        const original = conn.query.getMockImplementation();
        conn.query.mockImplementation(async (sql: string, params: any[]) => {
            if (sql.includes(query)) throw new Error('private storage details');
            return original(sql, params);
        });
        await expect(Contracts.deleteWithAuth(item)).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
        expect(events).not.toContain('auth'); expect(events).not.toContain('delete'); expect(events.at(-1)).toBe('unlock');
        conn.query.mockImplementation(original); await Contracts.delete(item); expect(events).toContain('delete');
    });
it('rechecks meeting arrangements after waiting for a committed batch', async () => {
    arrangements = [{ contractId: 1, CaseId: 30 }];
    let enter!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { enter = r; }); const hold = new Promise<void>(r => { resume = r; });
    const batch = Lifecycle.transaction(async () => { enter(); await hold; caseSources = [130]; });
    await ready;
    const deletion = Contracts.deleteWithAuth(item);
    const rejected = expect(deletion).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('meeting-cases'); resume(); await batch; await rejected;
    expect(events).not.toContain('auth'); expect(events).not.toContain('delete');
});
it.each(calls.slice(2))('refuses %s for a source arrangement in the main contract meeting', async (_, call) => {
    arrangements = [{ contractId: 1, CaseId: 30 }]; caseSources = [130];
    await expect(call()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS', status: 409 });
    expect(events).toEqual(['lock', 'source-check', 'meeting-cases', 'case-parents', 'case-operations', 'unlock']);
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
});
it.each(calls.slice(2))('refuses %s for a source arrangement only in a related contract meeting', async (_, call) => {
    arrangements = [{ contractId: 2, CaseId: 30 }]; caseSources = [130];
    await expect(call()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('auth'); expect(events).not.toContain('move');
});
it.each(calls.slice(2))('allows %s when the source arrangement belongs to an unrelated meeting contract', async (_, call) => {
    arrangements = [{ contractId: 3, CaseId: 30 }]; caseSources = [130];
    await call(); expect(events).toContain('move'); expect(events).not.toContain('case-parents');
});
it.each(calls.slice(2))('allows ordinary %s and deduplicates arrangements across the group', async (_, call) => {
    arrangements = [{ contractId: 1, CaseId: 20 }, { contractId: 2, CaseId: 20 }, { contractId: 2, CaseId: 30 }];
    await call(); expect(events).toContain('move');
    expect(conn.query).toHaveBeenCalledWith('SELECT Id, MilestoneId FROM Cases WHERE Id IN (?)', [[20, 30]]);
});
it('fails closed on a missing case in the related contract meeting', async () => {
    arrangements = [{ contractId: 2, CaseId: 30 }]; missingCases = [30];
    await expect(Contracts.moveToProjectWithAuth(1, 'NEW')).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(events).not.toContain('auth'); expect(events).not.toContain('move'); expect(events.at(-1)).toBe('unlock');
});
it.each(['FROM MeetingArrangements a', 'SELECT Id, MilestoneId FROM Cases', 'WHERE SourceMilestoneId IN (?)'])(
    'refuses move on failed %s and allows retry', async query => {
        arrangements = [{ contractId: 2, CaseId: 20 }];
        const original = conn.query.getMockImplementation();
        conn.query.mockImplementation(async (sql: string, params: any[]) => {
            if (sql.includes(query)) throw new Error('private storage details');
            return original(sql, params);
        });
        await expect(Contracts.moveToProjectWithAuth(1, 'NEW')).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
        expect(events).not.toContain('auth'); expect(events).not.toContain('move'); expect(events.at(-1)).toBe('unlock');
        conn.query.mockImplementation(original); await Contracts.moveToProjectWithAuth(1, 'NEW'); expect(events).toContain('move');
    });
it('rechecks related meeting arrangements after waiting for a committed batch', async () => {
    arrangements = [{ contractId: 2, CaseId: 30 }];
    let enter!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { enter = r; }); const hold = new Promise<void>(r => { resume = r; });
    const batch = Lifecycle.transaction(async () => { enter(); await hold; caseSources = [130]; });
    await ready;
    const move = Contracts.moveToProjectWithAuth(1, 'NEW');
    const rejected = expect(move).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('meeting-cases'); resume(); await batch; await rejected;
    expect(events).not.toContain('auth'); expect(events).not.toContain('move');
});
