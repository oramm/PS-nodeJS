jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, transaction: jest.fn(),
} }));
jest.mock('../../../aqmSync/AqmSync', () => ({ isAqmContractType: () => false }));
jest.mock('../../../fidmanSync/FidmanSync', () => ({
    lockFidmanFoldersContracts: jest.fn(async () => []),
    enqueueFidmanFoldersForContracts: jest.fn(async () => []),
    deliverFidmanFoldersAfterCommit: jest.fn(async () => undefined),
    isFidmanSyncEligible: () => false, readContractFidmanSyncEnabled: jest.fn(async () => false),
}));
import ToolsDb from '../../../../tools/ToolsDb';
import Contracts from '../../../ContractsController';
import ContractRepository from '../../../ContractRepository';
import SharingRepository from '../../sharing/MilestoneSharingRepository';
import Lifecycle from '../../sharing/MilestoneLifecycleController';
import Sharing from '../../sharing/MilestoneSharingController';

let events: string[], sources: number[], item: any, stored: any[];
const conn: any = { query: jest.fn(), release: jest.fn(), destroy: jest.fn(),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
const fields = ['status'];
beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks(); events = []; sources = []; stored = [{ Id: 1 }];
    item = { id: 1, alias: 'SYNTHETIC', status: 'ACTIVE', fidmanSyncEnabled: false,
        editFolder: jest.fn(async () => { events.push('folder'); }),
        editInScrum: jest.fn(async () => { events.push('scrum'); return false; }) };
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('o.DestinationMilestoneId')) return [[]];
        expect(sql).toContain('JOIN Milestones m ON m.Id = o.SourceMilestoneId');
        expect(sql).toContain('JOIN Contracts c ON c.Id = m.ContractId');
        expect(sql).not.toContain('OurIdRelated');
        expect(params).toEqual([1]); events.push('source-check');
        return [sources.includes(params[0]) ? [{ SourceMilestoneId: 10 }] : []];
    });
    jest.spyOn(SharingRepository.prototype, 'acquire').mockImplementation(async () => { events.push('lock'); return true; });
    jest.spyOn(SharingRepository.prototype, 'release').mockImplementation(async () => { events.push('unlock'); });
    jest.spyOn(SharingRepository.prototype, 'contracts').mockImplementation(async () => stored);
    jest.spyOn(SharingRepository.prototype, 'contractLinks').mockResolvedValue([]);
    jest.spyOn(SharingRepository.prototype, 'date').mockResolvedValue({ Id: 7, MilestoneId: 10 } as any);
    jest.spyOn(SharingRepository.prototype, 'snapshot').mockResolvedValue({ m: { Id: 10, ContractId: 1 } } as any);
    jest.spyOn(Contracts, 'createContractFromDto').mockImplementation(async dto => ({ ...item, ...dto }));
    jest.spyOn(Contracts as any, 'withAuth').mockImplementation(async (action: any) => {
        events.push('auth'); return action({}, {});
    });
    jest.spyOn(ContractRepository.prototype, 'editInDb').mockImplementation(async () => { events.push('write'); });
    (ToolsDb.transaction as jest.Mock).mockImplementation(async action => {
        events.push('begin');
        try { const result = await action(conn); events.push('commit'); return result; }
        catch (error) { events.push('rollback'); throw error; }
    });
});
const calls: [string, () => Promise<any>][] = [
    ['direct', () => Contracts.edit(item, undefined, fields)],
    ['with auth', () => Contracts.editWithAuth(item, fields)],
    ['through date', () => Contracts.editThroughMilestoneDateFromDto(7,
        { _fieldsToUpdate: fields, _milestone: { id: 10, _contract: item } })],
];
it.each(calls)('refuses source %s before auth and effects', async (_, call) => {
    sources = [1];
    await expect(call()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS', status: 409 });
    expect(events).toEqual(['lock', 'source-check', 'unlock']);
    expect(ToolsDb.transaction).not.toHaveBeenCalled();
});
it.each(calls)('allows ordinary %s and preserves selected fields and values', async (_, call) => {
    sources = [2]; await call();
    expect(events[0]).toBe('lock'); expect(events.slice(-2)).toEqual(['commit', 'unlock']);
    expect(SharingRepository.prototype.acquire).toHaveBeenCalledTimes(1);
    expect(ContractRepository.prototype.editInDb).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, status: 'ACTIVE' }), conn, true, fields);
    expect(item.editFolder).not.toHaveBeenCalled(); expect(item.editInScrum).not.toHaveBeenCalled();
});
it.each(calls)('rejects missing persisted contract %s before auth', async (_, call) => {
    stored = []; await expect(call()).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(events).not.toContain('auth'); expect(events).not.toContain('write');
});
it.each(calls)('fails closed on source-read error %s and releases for retry', async (_, call) => {
    conn.query.mockRejectedValueOnce(new Error('private storage detail'));
    await expect(call()).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
    expect(events).not.toContain('auth'); expect(events.at(-1)).toBe('unlock');
    await call(); expect(events).toContain('commit');
});
it.each(calls)('rejects nested batch %s before a second connection', async (_, call) => {
    await expect(Lifecycle.transaction(call)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
    expect(events).not.toContain('source-check'); expect(events).not.toContain('auth');
});
it('validates the persisted date owner despite a substituted contract in DTO', async () => {
    await expect(Contracts.editThroughMilestoneDateFromDto(7,
        { _milestone: { id: 10, _contract: { ...item, id: 2 } } })).rejects.toMatchObject({ code: 'DEPENDENCY_CONFLICT' });
    expect(events).not.toContain('source-check'); expect(events).not.toContain('auth');
});
it('preserves the shared-contract refusal', async () => {
    stored = [{ Id: 1, ProjectOurId: 'A' }]; item.projectOurId = 'B';
    (SharingRepository.prototype.contractLinks as jest.Mock).mockResolvedValue([{ MilestoneId: 10 }]);
    await expect(Contracts.editWithAuth(item, fields)).rejects.toMatchObject({ code: 'DEPENDENCY_CONFLICT' });
    expect(events).not.toContain('auth');
});
it('rejects invalid identity before any I/O', async () => {
    item.id = undefined; await expect(Contracts.editWithAuth(item, fields)).rejects.toBeDefined();
    expect(events).toEqual([]);
});
it('retains lock through DB rollback and permits subsequent edit', async () => {
    (ContractRepository.prototype.editInDb as jest.Mock).mockRejectedValueOnce(new Error('write failed'));
    await expect(Contracts.editWithAuth(item, fields)).rejects.toThrow('write failed');
    expect(events.slice(-2)).toEqual(['rollback', 'unlock']);
    await Contracts.edit(item, undefined, fields); expect(events.slice(-2)).toEqual(['commit', 'unlock']);
});
it('checks a newly committed operation after a queued batch', async () => {
    let enter!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { enter = r; }), hold = new Promise<void>(r => { resume = r; });
    const batch = Lifecycle.transaction(async () => { enter(); await hold; sources = [1]; });
    await ready;
    const edit = expect(Contracts.editWithAuth(item, fields)).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('source-check'); resume(); await batch; await edit;
    expect(events).not.toContain('auth');
});
it.each(['folder', 'scrum'])('waits for the other started effect when %s fails', async failing => {
    let resume!: () => void, enter!: () => void;
    const hold = new Promise<void>(r => { resume = r; }), ready = new Promise<void>(r => { enter = r; });
    const fail = jest.fn(async () => { throw new Error('effect failed'); });
    const wait = jest.fn(async () => { enter(); await hold; events.push('effect-finished'); return false; });
    item.editFolder = failing === 'folder' ? fail : wait;
    item.editInScrum = failing === 'scrum' ? fail : wait;
    const edit = expect(Contracts.editWithAuth(item, ['alias'])).rejects.toThrow('effect failed');
    await ready;
    const queued = Sharing.runExclusive(async () => { events.push('queued'); });
    await Promise.resolve(); expect(events).not.toContain('unlock'); expect(events).not.toContain('queued');
    resume(); await edit; await queued;
    expect(events.indexOf('effect-finished')).toBeLessThan(events.indexOf('unlock'));
    expect(events.indexOf('unlock')).toBeLessThan(events.indexOf('queued'));
    expect(events).not.toContain('write');
});
