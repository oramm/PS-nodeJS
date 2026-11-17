jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() } } }));
jest.mock('../../sharing/MilestoneLifecycleController', () => ({ __esModule: true, default: { run: jest.fn() } }));
import ToolsDb from '../../../../tools/ToolsDb';
import Sharing from '../../sharing/MilestoneLifecycleController';
import Guard from '../ConsolidationWriteGuardController';
import Cases from '../../cases/CasesController';

const conn = { query: jest.fn(), release: jest.fn() };
let events: string[], parents: any[], operations: any[];
beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks(); events=[]; parents=[{ Id:100, MilestoneId:1 }]; operations=[];
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    (Sharing.run as jest.Mock).mockImplementation(async action => { events.push('lock'); try {return await action()} finally {events.push('unlock')} });
    conn.query.mockImplementation(async (sql: string) => { if (sql.includes('o.DestinationMilestoneId')) return [[]]; events.push(sql.includes('FROM Cases') ? 'parents' : 'operations'); return [sql.includes('FROM Cases') ? parents : operations]; });
    conn.release.mockImplementation(() => events.push('release-read-connection'));
});
it('uses real repository reads and holds lifecycle serialization through the awaited write action', async () => {
    const result = await Guard.cases([2], [100], async () => { events.push('write'); await Promise.resolve(); events.push('commit-and-IO'); return 'ok'; });
    expect(result).toBe('ok'); expect(events).toEqual(['lock','parents','operations','release-read-connection','write','commit-and-IO','unlock']);
    expect(conn.query.mock.calls[1][1]).toEqual([[1,2]]);
});
it('denies a persisted source despite a forged destination in the payload, before action', async () => {
    operations=[{ OperationId:'op',SourceMilestoneId:1 }]; const action=jest.fn();
    await expect(Guard.cases([99],[100],action)).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS',status:409});
    expect(action).not.toHaveBeenCalled(); expect(conn.release).toHaveBeenCalledTimes(1);
});
it('does not filter away completed operation records or expose operation content in errors', async () => {
    operations=[{ OperationId:'private-id',SourceMilestoneId:1 }];
    await expect(Guard.cases([1],[],async()=>true)).rejects.toMatchObject({message:'OPERATION_IN_PROGRESS'});
    expect(conn.query.mock.calls[0][0]).not.toMatch(/State|SnapshotJSON/);
});
it('refuses missing parents and storage failures before action', async () => {
    parents=[]; const action=jest.fn();
    await expect(Guard.cases([],[100],action)).rejects.toMatchObject({code:'OBJECT_NOT_FOUND'});
    expect(action).not.toHaveBeenCalled();
    conn.query.mockRejectedValue(new Error('private SQL'));
    await expect(Guard.cases([1],[],action)).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR',message:'RETRYABLE_STORAGE_ERROR'});
});
it('rejects invalid IDs before acquiring the lock', async () => {
    await expect(Guard.cases([undefined],[],async()=>true)).rejects.toMatchObject({code:'INVALID_SNAPSHOT'});
    expect(Sharing.run).not.toHaveBeenCalled();
});
it.each(['add','edit','delete','bulk'])('protects public Cases %s before existing SQL/Google work', async mode => {
    operations=[{OperationId:'op',SourceMilestoneId:1}]; const auth=jest.spyOn(Cases as any,'withAuth');
    const item: any={id:100,milestoneId:1};
    const call=mode==='add'?()=>Cases.add(item):mode==='edit'?()=>Cases.edit({...item,milestoneId:99},undefined,['status']):mode==='delete'?()=>Cases.delete({...item,milestoneId:99}):()=>Cases.addBulkWithDefaultTasks([item],{} as any);
    await expect(call()).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(auth).not.toHaveBeenCalled();
});
it('ignores an unselected parent field in a normal partial edit and delegates unchanged', async () => {
    const auth=jest.spyOn(Cases as any,'withAuth').mockResolvedValue('unchanged');
    expect(await Cases.edit({id:100,milestoneId:99} as any,undefined,['status'])).toBe('unchanged');
    expect(conn.query.mock.calls[1][1]).toEqual([[1]]); expect(auth).toHaveBeenCalledTimes(1);
});
