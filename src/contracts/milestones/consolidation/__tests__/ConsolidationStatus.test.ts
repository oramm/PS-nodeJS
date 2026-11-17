jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() } } }));
jest.mock('../ConsolidationOperationRepository');
jest.mock('../ConsolidationPreviewRepository');
jest.mock('../ConsolidationNoteRepository');
import Controller from '../ConsolidationStatusController';
import ToolsDb from '../../../../tools/ToolsDb';
import Operations from '../ConsolidationOperationRepository';
import Participants from '../ConsolidationPreviewRepository';
import Notes from '../ConsolidationNoteRepository';
import Operation from '../ConsolidationOperation';
import Preview, { canonical } from '../ConsolidationPreview';
import Router from '../ConsolidationPreviewRouters';
import { operationFixture } from './operationFixture';
import { createHash } from 'crypto';
const user: any = { enviId: 7, systemRoleId: 1 };
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const conn = { query: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), destroy: jest.fn() };
let record: ReturnType<typeof Operation.first>, current: any;
beforeEach(() => {
    jest.resetAllMocks();
    conn.query.mockImplementation(async(sql:string)=>sql.includes('FROM PersonAccounts')?[[{PersonId:7,SystemRoleId:1,SystemEmail:'synthetic@example.invalid',IsActive:1}]]:[[]]);
    const fixture = operationFixture(), p = fixture.make();
    record = Operation.first(Preview.serialize(p), fixture.body(p,false), id, 7);
    current = { milestones: fixture.snapshot.rows.Milestones, contracts: fixture.snapshot.rows.Contracts,
        contractIds: fixture.snapshot.rows.Contracts.map((c:any) => c.Id) };
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    (Operations.prototype.find as jest.Mock).mockImplementation(async () => record);
    (Participants.prototype.participants as jest.Mock).mockImplementation(async () => current);
    (Participants.prototype.contracts as jest.Mock).mockImplementation(async () => current.contracts);
    (Notes.prototype.findForOperation as jest.Mock).mockResolvedValue([{Body:'ź'.repeat(140000),OperationId:id}]);
});
it.each([1,2,3])('reads durable progress and full operation notes for authorized role %s', async systemRoleId => {
    const result = await Controller.get(id,{...user,systemRoleId});
    expect(result).toMatchObject({state:'TRANSFERRING',counts:{moved:1,pending:1},documentsReady:false,
        requiresRevalidation:true,allowedActions:['PREVIEW','CHECK'],cleanup:{verificationComplete:false,remainingCount:null}});
    expect(result.units.map(u => u.unitId)).toEqual(Operation.restore(record).units.map(u => u.unitId));
    expect(result.caseMappings).toEqual(Operation.restore(record).caseMappings);
    expect((await Controller.getNotes(id,{...user,systemRoleId})).notes[0].Body).toHaveLength(140000);
    expect(Operations.prototype.find).toHaveBeenCalledWith(id,conn,false);
    expect(Notes.prototype.findForOperation).toHaveBeenCalledWith(id,conn);
    expect(conn.query).toHaveBeenCalledWith('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
});
it.each([undefined,4,5,6])('denies role %s before obtaining a connection', async role => {
    await expect(Controller.get(id,role ? {...user,systemRoleId:role} : undefined)).rejects.toMatchObject({status:role ? 403 : 401});
    await expect(Controller.getNotes(id,role ? {...user,systemRoleId:role} : undefined)).rejects.toMatchObject({status:role ? 403 : 401});
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
it('validates operation identity before SQL and conceals a missing/foreign record', async () => {
    await expect(Controller.get('bad',user)).rejects.toMatchObject({code:'INVALID_REQUEST'});
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
    await expect(Controller.getNotes(id,user,{projectOurIds:[]})).rejects.toMatchObject({code:'OBJECT_NOT_FOUND'});
    (Operations.prototype.find as jest.Mock).mockResolvedValue(undefined);
    await expect(Controller.get(id,user)).rejects.toMatchObject({code:'OBJECT_NOT_FOUND'});
    expect(Notes.prototype.findForOperation).not.toHaveBeenCalled();
});
it.each(['current','historical','deleted','moved-project','corrupt'])('denies %s participant/integrity failure before note content', async kind => {
    const scope = {projectOurIds:[record.projectOurId]};
    if (kind === 'current') { current.contractIds.push(99); current.contracts.push({Id:99,ProjectOurId:'FOREIGN'}); }
    if (kind === 'historical' || kind === 'deleted') {
        const state = Operation.restore(record); state.participantContractIds.push(99);
        record.snapshotJSON = canonical(state); record.revision = createHash('sha256').update(record.snapshotJSON).digest('hex');
        (Participants.prototype.contracts as jest.Mock).mockResolvedValue(kind === 'deleted' ? current.contracts : [...current.contracts,{Id:99,ProjectOurId:'FOREIGN'}]);
    }
    if (kind === 'moved-project') current.contracts.forEach((c:any) => c.ProjectOurId='OTHER');
    if (kind === 'corrupt') record.revision = '0'.repeat(64);
    await expect(Controller.getNotes(id,user,kind === 'moved-project' ? undefined : scope)).rejects.toMatchObject({code:
        kind === 'deleted' ? 'OBJECT_NOT_FOUND' : kind === 'moved-project' ? 'CROSS_PROJECT' : kind === 'corrupt' ? 'SNAPSHOT_INTEGRITY_ERROR' : 'SCOPE_DENIED'});
    expect(Notes.prototype.findForOperation).not.toHaveBeenCalled(); expect(conn.rollback).toHaveBeenCalled();
});
it('denies an absent source without durable completed proof', async () => {
    current.milestones=current.milestones.filter((m:any)=>Number(m.Id)!==record.sourceMilestoneId);
    await expect(Controller.get(id,user)).rejects.toMatchObject({code:'OBJECT_NOT_FOUND'});
});
it('sanitizes storage failure, discards failed rollback connections and releases on success', async () => {
    (Notes.prototype.findForOperation as jest.Mock).mockRejectedValue(new Error('private SQL content'));
    conn.rollback.mockRejectedValue(new Error('lost connection'));
    await expect(Controller.getNotes(id,user)).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR',message:'RETRYABLE_STORAGE_ERROR'});
    expect(conn.destroy).toHaveBeenCalledTimes(1); expect(conn.release).not.toHaveBeenCalled();
});
it.each(['/milestone-consolidations/:operationId','/milestone-consolidations/:operationId/notes'])('handler %s uses URL identity and session/scope', async path => {
    const layer = Router.stack.find((l:any) => l.route?.path === path) as any;
    const send=jest.fn(),next=jest.fn();
    await layer.route.stack[0].handle({params:{operationId:id},body:{operationId:'forged'},session:{userData:user},projectScope:{projectOurIds:[]}}, {send},next);
    expect(send).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledWith(expect.objectContaining({code:'OBJECT_NOT_FOUND'}));
    await layer.route.stack[0].handle({params:{operationId:id},session:{userData:user}}, {send},next);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({operationId:id}));
});
