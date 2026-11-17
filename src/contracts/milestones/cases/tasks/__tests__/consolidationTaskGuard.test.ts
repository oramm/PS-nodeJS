jest.mock('../../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() } } }));
jest.mock('../../../../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
import ToolsDb from '../../../../../tools/ToolsDb';
import Tasks from '../TasksController';
import Repository from '../TaskRepository';
import CaseRepository from '../../CaseRepository';
import Task from '../Task';
import Setup from '../../../../../setup/Setup';
import CurrentSprint from '../../../../../ScrumSheet/CurrentSprint';

const auth = {} as any;
let sourceBlocked: boolean, events: string[];
const conn = { query: jest.fn(), release: jest.fn(), destroy: jest.fn() };
beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks(); sourceBlocked = true; events = [];
    for (const key of ['log', 'error', 'group', 'groupEnd'] as const) jest.spyOn(console, key).mockImplementation(() => {});
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ok:1}]]; }
        if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[]]; }
        if (sql.includes('FROM Cases')) return [params[0].map((id: number) => ({ Id:id, MilestoneId: id === 100 ? 1 : 2 }))];
        if (sql.includes('FROM MilestoneConsolidationOperations')) return [sourceBlocked && params[0].includes(1) ? [{OperationId:'op',SourceMilestoneId:1}] : []];
        throw new Error('Unexpected SQL in synthetic test');
    });
    jest.spyOn(Repository.prototype,'findById').mockResolvedValue(new Task({id:12,_parent:{id:100,milestoneId:1}} as any));
    jest.spyOn(CaseRepository.prototype,'hasSharedMilestone').mockResolvedValue(false);
    jest.spyOn(Repository.prototype,'addInDb').mockResolvedValue(undefined as any);
    jest.spyOn(Repository.prototype,'editInDb').mockResolvedValue(undefined as any);
    jest.spyOn(Repository.prototype,'deleteFromDb').mockResolvedValue(undefined as any);
    jest.spyOn(Tasks,'addInScrum').mockResolvedValue(undefined as any);
    jest.spyOn(Tasks,'editInScrum').mockResolvedValue(undefined as any);
    jest.spyOn(Tasks,'deleteFromScrum').mockResolvedValue(undefined as any);
});
afterEach(() => jest.restoreAllMocks());

it('refuses new work at the persisted source despite forged parent metadata before auth or writes', async () => {
    const authenticate=jest.spyOn(Tasks as any,'withAuth');
    await expect(Tasks.add({_case:{id:100,milestoneId:999},caseId:200} as any,auth)).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(authenticate).not.toHaveBeenCalled();
    expect(Repository.prototype.addInDb).not.toHaveBeenCalled(); expect(Tasks.addInScrum).not.toHaveBeenCalled();
    expect(events).toEqual(['lock','unlock']);
});
it('allows a destination task with exact hour values and completes DB and backup before unlocking', async () => {
    (Tasks.addInScrum as jest.Mock).mockImplementation(async()=>{events.push('backup');});
    const saved=await Tasks.add({_case:{id:200},hoursMon:2.5,hoursTue:null,hoursWed:0} as any,auth);
    expect(saved).toMatchObject({caseId:200,hoursMon:2.5,hoursTue:null,hoursWed:0});
    expect(events).toEqual(['lock','backup','unlock']);
});
it.each([[100,200],[200,100]])('refuses ordinary reparenting involving a source: %s -> %s', async (from,to) => {
    (Repository.prototype.findById as jest.Mock).mockResolvedValue(new Task({id:12,_parent:{id:from,milestoneId:2}} as any));
    await expect(Tasks.edit({id:12,_case:{id:to}} as any,['caseId'],auth)).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(Repository.prototype.editInDb).not.toHaveBeenCalled(); expect(Tasks.editInScrum).not.toHaveBeenCalled();
    expect(events).toEqual(['lock','unlock']); // real nested lifecycle lock is reentrant
});
it('allows ordinary selected-hour edits at the source, ignoring an unselected forged parent', async () => {
    const saved=await Tasks.edit({id:12,_case:{id:200},hoursMon:3.25,hoursTue:null} as any,['hoursMon','hoursTue'],auth);
    expect(saved).toMatchObject({hoursMon:3.25,hoursTue:null});
    expect((Repository.prototype.editInDb as jest.Mock).mock.calls[0][3]).toEqual(['hoursMon','hoursTue']);
    expect(conn.query.mock.calls.some(([sql])=>sql.includes('FROM Cases'))).toBe(false);
    expect(events).toEqual(['lock','unlock']);
});
it('allows a normal reparent outside consolidation', async () => {
    sourceBlocked=false;
    expect(await Tasks.edit({id:12,_case:{id:200}} as any,['caseId'],auth)).toMatchObject({caseId:200});
    expect(Repository.prototype.editInDb).toHaveBeenCalledTimes(1);
});
it('awaits the real backup deletion method before releasing the lifecycle lock', async () => {
    (Tasks.deleteFromScrum as jest.Mock).mockRestore();
    jest.spyOn(Setup,'scrumSheetSyncEnabled','get').mockReturnValue(true);
    let finish!:()=>void, started!:()=>void;
    const began=new Promise<void>(resolve=>{started=resolve;});
    const pending=new Promise<void>(resolve=>{finish=resolve;});
    jest.spyOn(CurrentSprint,'deleteRowsByColValue').mockImplementation(()=>{started();return pending as any;});
    const deleting=Tasks.delete({id:12} as any,auth);
    await began; await Promise.resolve();
    expect(events).toEqual(['lock']);
    finish(); await deleting; expect(events).toEqual(['lock','unlock']);
});
it.each(['edit','delete'])('keeps %s serialized until every started write settles even after a failure', async mode => {
    let finish!:()=>void, started!:()=>void;
    const began=new Promise<void>(resolve=>{started=resolve;});
    const pending=new Promise<void>(resolve=>{finish=resolve;});
    const db=mode==='edit'?Repository.prototype.editInDb:Repository.prototype.deleteFromDb;
    const backup=mode==='edit'?Tasks.editInScrum:Tasks.deleteFromScrum;
    (db as jest.Mock).mockRejectedValue(new Error('synthetic failure'));
    (backup as jest.Mock).mockImplementation(()=>{started();return pending;});
    let settled=false;
    const first=(mode==='edit'?Tasks.edit({id:12} as any,['status'],auth):Tasks.delete({id:12} as any,auth))
        .then(()=>{throw new Error('Expected failure');},error=>{settled=true;return error;});
    await began;
    const second=Tasks.add({_case:{id:200}} as any,auth);
    await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(false); expect(events).toEqual(['lock']);
    expect(Repository.prototype.addInDb).not.toHaveBeenCalled();
    finish(); expect((await first).message).toBe('synthetic failure'); await second;
    expect(events).toEqual(['lock','unlock','lock','unlock']);
});
