jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() }, transaction: jest.fn() } }));
import Db from '../../../../tools/ToolsDb';
import Guard from '../ConsolidationWriteGuardController';
import Repository from '../ConsolidationWriteGuardRepository';
import LockRepository from '../../sharing/MilestoneSharingRepository';
import Lifecycle from '../../sharing/MilestoneLifecycleController';
import Milestones from '../../MilestonesController';
import Cases from '../../cases/CasesController';
import Contracts from '../../../ContractsController';
import Projects from '../../../../projects/ProjectsController';
import Sharing from '../../sharing/MilestoneSharingController';
import Milestone from '../../Milestone';
import Case from '../../cases/Case';
import Project from '../../../../projects/Project';
import ContractOther from '../../../ContractOther';
import ProjectRepository from '../../../../projects/ProjectRepository';
import ProjectEntities from '../../../../projects/ProjectEntitiesController';
import * as Fidman from '../../../fidmanSync/FidmanSync';
import MilestoneRepository from '../../MilestoneRepository';

const conn: any = { query: jest.fn(), release: jest.fn(), destroy: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
let events: string[], rows: any[];
const context = { ContractId: 2, TypeId: 5, OfferId: null, GdFolderId: 'folder', MilestoneId: 10, ParentCaseId: null, ProjectOurId: 'P', OurId: 'P', OurIdRelated: null };
beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks(); events = []; rows = [{ ...context }];
    (Db.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    jest.spyOn(LockRepository.prototype, 'acquire').mockImplementation(async () => { events.push('lock'); return true; });
    jest.spyOn(LockRepository.prototype, 'release').mockImplementation(async () => { events.push('unlock'); });
    jest.spyOn(Repository.prototype, 'structuralOperations').mockImplementation(async () => rows);
    jest.spyOn(Repository.prototype, 'sourceOperations').mockResolvedValue([]);
    jest.spyOn(Repository.prototype, 'contractSourceOperations').mockResolvedValue([]);
    jest.spyOn(Repository.prototype, 'contractDestinationOperations').mockResolvedValue([]);
    jest.spyOn(Repository.prototype, 'destinationOperations').mockResolvedValue([]);
    jest.spyOn(Repository.prototype, 'contractMeetingCases').mockResolvedValue([]);
    jest.spyOn(Repository.prototype, 'caseParents').mockImplementation(async ids => ids.map(Id => ({Id, MilestoneId:10})) as any);
    jest.spyOn(Sharing, 'guardMilestone').mockResolvedValue({links: []} as any);
    jest.spyOn(Sharing, 'guardContract').mockResolvedValue({} as any);
    jest.spyOn(Sharing, 'decorate').mockImplementation(async items => items);
    for (const c of [Milestones, Cases, Contracts, Projects]) {
        if ('editUnsafe' in c) jest.spyOn(c as any, 'editUnsafe').mockImplementation(async () => { events.push('effect'); return {}; });
        if ('deleteUnsafe' in c) jest.spyOn(c as any, 'deleteUnsafe').mockImplementation(async () => { events.push('effect'); });
        if ('withAuth' in c) jest.spyOn(c as any, 'withAuth').mockImplementation(async () => { events.push('effect'); return {}; });
    }
});
const item = () => new Milestone({ id:10, _contract:{id:2}, _type:{id:5}, gdFolderId:'folder' } as any);
const caseItem = () => new Case({ id:20, _parent:{id:10}, _type:{id:5}, gdFolderId:'folder' } as any);
it.each([
    ['milestone', () => Milestones.delete(item())],
    ['case', () => Cases.delete(caseItem())],
    ['project', () => Projects.delete(new Project({id:30,ourId:'forged'}))],
])('blocks destination %s deletion before auth and effects', async (_, action) => {
    await expect(action()).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(events).toEqual(['lock','unlock']);
});
it.each(['delete','move'] as const)('blocks destination contract %s including group cascades', async mode => {
    (Repository.prototype.contractDestinationOperations as jest.Mock).mockResolvedValue([{OperationId:'op'}]);
    await expect(mode === 'delete' ? Contracts.delete({id:2} as any) : Contracts.moveToProject(2,'NEXT',{} as any)).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(Repository.prototype.contractDestinationOperations).toHaveBeenCalledWith(2,mode==='move',conn);
    expect(events).toEqual(['lock','unlock']);
});
it.each([
    ['milestone parent', () => Milestones.edit(new Milestone({id:10,_contract:{id:99},_type:{id:5}} as any))],
    ['milestone type', () => Milestones.edit(new Milestone({id:10,_contract:{id:2},_type:{id:99}} as any))],
    ['case parent', () => Cases.edit(new Case({id:20,_parent:{id:99},_type:{id:5}} as any))],
    ['case type', () => Cases.edit(new Case({id:20,_parent:{id:10},_type:{id:99}} as any))],
    ['case hierarchy', () => Cases.edit(new Case({id:20,_parent:{id:10},_type:{id:5},parentCaseId:99} as any))],
    ['contract project', () => Contracts.edit({id:2,projectOurId:'OTHER'} as any)],
    ['contract folder', () => Contracts.editWithAuth({id:2,gdFolderId:'OTHER'} as any)],
    ['project identity', () => Projects.edit(new Project({id:30,ourId:'OTHER'}))],
    ['project folder', () => Projects.edit(new Project({id:30,ourId:'P',gdFolderId:'OTHER'}))],
])('blocks a destination structure change through %s controller', async (_, action) => {
    await expect(action()).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(events).toEqual(['lock','unlock']);
});
it.each([
    ['milestone status', () => Milestones.edit({...item(),contractId:99} as any,undefined,undefined,['status'])],
    ['milestone full ordinary edit', () => Milestones.edit(item())],
    ['case status', () => Cases.edit({...caseItem(),milestoneId:99} as any,undefined,['status'])],
    ['case full ordinary edit', () => Cases.edit(caseItem())],
    ['contract status', () => Contracts.edit({id:2,projectOurId:'OTHER'} as any,undefined,['status'])],
    ['project name', () => Projects.edit(new Project({id:30,ourId:'P',name:'updated'}))],
])('keeps destination available for %s', async (_, action) => {
    await action(); expect(events).toEqual(['lock','effect','unlock']);
});
it.each(['PUT','DELETE'] as const)('denies source sharing %s before business mutation', async method => {
    (Repository.prototype.sourceOperations as jest.Mock).mockResolvedValue([{OperationId:'op'}]);
    await expect(Sharing.mutate(10,2,method,{}, {enviId:1,systemRoleId:1} as any)).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(Db.transaction).not.toHaveBeenCalled(); expect(events).toEqual(['lock','unlock']);
});
it('denies destination detach and allows destination attach to existing validation', async () => {
    (Repository.prototype.destinationOperations as jest.Mock).mockResolvedValue([{OperationId:'op'}]);
    await expect(Sharing.mutate(10,2,'DELETE',{}, {enviId:1,systemRoleId:1} as any)).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    const mutation=jest.spyOn(Sharing as any,'mutateValidated').mockResolvedValue('ok');
    await expect(Sharing.mutate(10,2,'PUT',{}, {enviId:1,systemRoleId:1} as any)).resolves.toBe('ok');
    expect(mutation).toHaveBeenCalledTimes(1);
});
it('fails closed on storage errors without leaking SQL then releases queue', async () => {
    (Repository.prototype.structuralOperations as jest.Mock).mockRejectedValueOnce(new Error('private query'));
    await expect(Projects.delete({id:30} as any)).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR',message:'RETRYABLE_STORAGE_ERROR'});
    rows=[]; await Projects.delete({id:30} as any); expect(events).toEqual(['lock','unlock','lock','effect','unlock']);
});
it('rechecks operation after a competing batch commits', async () => {
    rows=[]; let enter!:()=>void, release!:()=>void;
    const entered=new Promise<void>(r=>enter=r), hold=new Promise<void>(r=>release=r);
    const batch=Lifecycle.transaction(async()=>{enter();await hold;rows=[context];}); await entered;
    const request=Milestones.delete(item()); const refusal=expect(request).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(Repository.prototype.structuralOperations).not.toHaveBeenCalled();release();await batch;await refusal;
    expect(events).not.toContain('effect');
});
it('keeps the lifecycle lock until all awaited deletion work finishes', async () => {
    rows=[]; let finish!:()=>void;const hold=new Promise<void>(r=>finish=r);
    jest.spyOn(Milestones as any,'deleteUnsafe').mockImplementation(async()=>{events.push('start');await hold;events.push('done');});
    const operation=Milestones.delete(item());
    for(let i=0;i<20&&!events.includes('start');i++)await Promise.resolve();
    expect(events).not.toContain('unlock');finish();await operation;expect(events).toEqual(['lock','start','done','unlock']);
});
it.each(['milestone','case','contract','project'] as const)('rejects nested %s structural write in batch',async kind=>{
    await expect(Lifecycle.transaction(()=>Guard.structure(kind,1,undefined,undefined,async()=>undefined))).rejects.toMatchObject({code:'NESTED_LIFECYCLE_WRITE'});
    expect(Repository.prototype.structuralOperations).not.toHaveBeenCalled();
});
it('repository queries use persisted IDs and include both contracts of move group',async()=>{
    jest.restoreAllMocks();conn.query.mockResolvedValue([[]]);const repo=new Repository();
    for(const kind of ['milestone','case','contract','project'] as const)await repo.structuralOperations(kind,7,conn);
    expect(conn.query.mock.calls.slice(0,4).every((call:any[])=>JSON.stringify(call[1])==='[7]')).toBe(true);
    expect(conn.query.mock.calls[1][0]).toContain('c.MilestoneId = o.DestinationMilestoneId');
    expect(conn.query.mock.calls[3][0]).toContain('p.OurId = o.ProjectOurId');
    await repo.contractDestinationOperations(7,true,conn);
    expect(conn.query.mock.calls[4][0]).toContain('c.OurIdRelated = (SELECT OurId FROM OurContractsData WHERE Id = ?)');
    expect(conn.query.mock.calls[4][1]).toEqual([7,7]);
});

it('uses project and related-contract identities normalized by the real contract model', async () => {
    const contract = new ContractOther({id:2,_type:{id:5},_project:{ourId:'OTHER'},_ourContract:{ourId:'AB.01'}});
    expect(contract.projectOurId).toBe('OTHER'); expect(contract.ourIdRelated).toBe('AB.01');
    await expect(Contracts.edit(contract)).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(events).not.toContain('effect');
});
it('rejects forged folder context during partial edits that still invoke external effects',async()=>{
    await expect(Milestones.edit({...item(),gdFolderId:'foreign'} as any,undefined,undefined,['typeId'])).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(events).not.toContain('effect');
});

it.each(['DB','folder'] as const)('keeps project lock until both started effects settle when %s fails',async failure=>{
    rows=[];let release!:()=>void,enter!:()=>void;const hold=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>enter=r);
    const delayed=async()=>{enter();await hold;events.push('finished');};
    const fail=async()=>{throw new Error('effect failed');};
    jest.spyOn(Projects as any,'withAuth').mockImplementation(async(cb:any)=>cb(new Projects(),{}));
    jest.spyOn(ProjectRepository.prototype,'editInDb').mockImplementation(failure==='folder'?delayed:fail);
    jest.spyOn(ProjectEntities,'deleteByProjectId').mockResolvedValue(undefined);
    jest.spyOn(Fidman,'projectHasSyncedContract').mockResolvedValue(false);
    (Db.transaction as jest.Mock).mockImplementation(async cb=>cb(conn));
    const project={id:30,ourId:'P',editProjectFolder:failure==='DB'?delayed:fail} as any;
    const operation=Projects.edit(project);const result=expect(operation).rejects.toThrow('effect failed');await ready;
    await Promise.resolve();expect(events).not.toContain('unlock');release();await result;
    expect(events.slice(-2)).toEqual(['finished','unlock']);
});
it.each(['folder','scrum'] as const)('keeps milestone lock until both started effects settle when %s fails',async failure=>{
    rows=[];let release!:()=>void,enter!:()=>void;const hold=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>enter=r);
    const delayed=async()=>{enter();await hold;events.push('finished');};const fail=async()=>{throw new Error('effect failed');};
    (Milestones as any).editUnsafe.mockRestore();
    jest.spyOn(Milestones as any,'withAuth').mockImplementation(async(cb:any)=>cb(new Milestones(),{}));
    jest.spyOn(MilestoneRepository.prototype,'editMilestoneWithDates').mockResolvedValue(item());
    jest.spyOn(Sharing,'touch').mockResolvedValue(undefined);
    jest.spyOn(Milestones.prototype as any,'editMilestoneFolder').mockImplementation(failure==='folder'?fail:delayed);
    (Db.transaction as jest.Mock).mockImplementation(async cb=>cb(conn));
    const milestone=item();milestone.number=1;milestone.editInScrum=failure==='scrum'?fail:delayed;
    const operation=Milestones.edit(milestone);const result=expect(operation).rejects.toThrow('effect failed');await ready;
    await Promise.resolve();expect(events).not.toContain('unlock');release();await result;
    expect(events.slice(-2)).toEqual(['finished','unlock']);
});
