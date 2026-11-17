jest.mock('../../../../tools/ToolsDb',()=>({__esModule:true,default:{pool:{getConnection:jest.fn()}}}));
jest.mock('../../../../persons/projectAssignments/ProjectAssignmentRepository',()=>({__esModule:true,default:{getAssignedProjectOurIds:jest.fn()}}));
import ToolsDb from '../../../../tools/ToolsDb';
import Controller from '../ConsolidationGuidanceController';
import GuardRepository from '../ConsolidationWriteGuardRepository';
import Participants from '../ConsolidationPreviewRepository';
import GuidanceRepository from '../ConsolidationGuidanceRepository';
import {isAllowedForRole} from '../../../../setup/Sessions/projectScopedPolicy';
import {SystemRoleName} from '../../../../types/sessionTypes';
let conn:any,events:string[];
const request={caseIds:[10,20],milestoneIds:[]};
beforeEach(()=>{
    events=[];conn={query:jest.fn(async(sql:string)=>sql.includes('FROM PersonAccounts')?[[{PersonId:7,SystemRoleId:1,SystemEmail:'synthetic@example.invalid',IsActive:1}]]:[[]]),commit:jest.fn(async()=>{}),rollback:jest.fn(async()=>{}),release:jest.fn(),destroy:jest.fn()};
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    jest.spyOn(GuardRepository.prototype,'caseParents').mockImplementation(async()=>{events.push('objects');return [{Id:10,MilestoneId:1},{Id:20,MilestoneId:2}] as any;});
    jest.spyOn(GuidanceRepository.prototype,'milestones').mockResolvedValue([{Id:1,ContractId:100,OfferId:null},{Id:2,ContractId:200,OfferId:null}] as any);
    jest.spyOn(GuidanceRepository.prototype,'offers').mockResolvedValue([]);
    jest.spyOn(Participants.prototype,'participants').mockImplementation(async()=>{events.push('participants');return {milestones:[{Id:1,ContractId:100},{Id:2,ContractId:200}],links:[],contractIds:[100,200],contracts:[{Id:100,ProjectOurId:'P'},{Id:200,ProjectOurId:'Q'}]} as any;});
    jest.spyOn(GuardRepository.prototype,'sourceOperations').mockImplementation(async()=>{events.push('operations');return [{OperationId:'hidden',SourceMilestoneId:1}] as any;});
});
afterEach(()=>jest.restoreAllMocks());
it.each([1,4,6,7])('permits minimal guidance for signed role %s within its existing scope',async systemRoleId=>{
    expect(await Controller.workTargets(request,{enviId:7,systemRoleId} as any,{projectOurIds:['P','Q']})).toEqual({blocked:true});
    expect(events).toEqual(['objects','participants','operations']);expect(conn.commit).toHaveBeenCalledTimes(1);
});
it('denies a single foreign case in a many-case letter before operation metadata',async()=>{
    await expect(Controller.workTargets(request,{enviId:7,systemRoleId:6} as any,{projectOurIds:['P']})).rejects.toMatchObject({code:'SCOPE_DENIED'});
    expect(events).toEqual(['objects','participants']);expect(conn.rollback).toHaveBeenCalledTimes(1);
});
it('requires every requested case and milestone to exist before operation metadata',async()=>{
    (GuardRepository.prototype.caseParents as jest.Mock).mockResolvedValue([{Id:10,MilestoneId:1}]);
    await expect(Controller.workTargets(request,{enviId:7,systemRoleId:1} as any)).rejects.toMatchObject({code:'OBJECT_NOT_FOUND'});
    expect(GuardRepository.prototype.sourceOperations).not.toHaveBeenCalled();
});
it.each([undefined,{enviId:0},{enviId:'7'}])('auth fails before SQL for %j',async user=>{
    await expect(Controller.workTargets(request,user as any)).rejects.toMatchObject({code:'SESSION_REQUIRED'});expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
it.each([{caseIds:[],milestoneIds:[]},{caseIds:[10,10],milestoneIds:[]},{caseIds:['10'],milestoneIds:[]},{caseIds:[Infinity],milestoneIds:[]},{caseIds:Array(101).fill(10),milestoneIds:[]},{caseIds:[10],milestoneIds:[],force:true}])('strict bounded request rejects %j before SQL',async input=>{
    await expect(Controller.workTargets(input,{enviId:7,systemRoleId:1} as any)).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
it('rejects a conflicting supplied parent milestone before operation metadata',async()=>{
    await expect(Controller.workTargets({caseIds:[10,20],milestoneIds:[1]},{enviId:7,systemRoleId:1} as any)).rejects.toMatchObject({code:'INVALID_REQUEST'});expect(GuardRepository.prototype.sourceOperations).not.toHaveBeenCalled();
});
it.each([SystemRoleName.CONTRACT_WORKER,SystemRoleName.CLIENT])('route policy only opens the minimal read for %s',role=>{
    expect(isAllowedForRole(role,'POST','/milestone-consolidations/work-targets')).toBe(true);
    expect(isAllowedForRole(role,'POST','/milestone-consolidations/history-resolution')).toBe(true);
    for(const action of ['preview','apply','prepare-targets'])expect(isAllowedForRole(role,'POST','/milestone-consolidations/'+action)).toBe(false);
    expect(isAllowedForRole(role,'GET','/milestones/1/consolidation')).toBe(false);
});
it('rechecks current operation state on each request instead of caching a negative',async()=>{
    (GuardRepository.prototype.sourceOperations as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([{OperationId:'late'}]);
    expect(await Controller.workTargets(request,{enviId:7,systemRoleId:1} as any)).toEqual({blocked:false});
    expect(await Controller.workTargets(request,{enviId:7,systemRoleId:1} as any)).toEqual({blocked:true});
});
it.each([{caseIds:[],milestoneIds:[1]},{caseIds:[10],milestoneIds:[]},{caseIds:[10,20],milestoneIds:[]}])('preserves existing unrestricted offer case/task/letter creation guidance %j',async input=>{
    const mids=input.milestoneIds.length?input.milestoneIds:input.caseIds.map(id=>id/10);
    (GuardRepository.prototype.caseParents as jest.Mock).mockResolvedValue(input.caseIds.map(Id=>({Id,MilestoneId:Id/10})));
    (GuidanceRepository.prototype.milestones as jest.Mock).mockResolvedValue(mids.map(Id=>({Id,ContractId:null,OfferId:900})));
    (GuidanceRepository.prototype.offers as jest.Mock).mockResolvedValue([{Id:900}]);
    (GuardRepository.prototype.sourceOperations as jest.Mock).mockResolvedValue([]);
    await expect(Controller.workTargets(input,{enviId:7,systemRoleId:4} as any)).resolves.toEqual({blocked:false});
    expect(Participants.prototype.participants).not.toHaveBeenCalled();
});
it('does not grant scoped roles access to offer parents',async()=>{
    (GuidanceRepository.prototype.milestones as jest.Mock).mockResolvedValue([{Id:1,ContractId:null,OfferId:900},{Id:2,ContractId:null,OfferId:900}]);
    await expect(Controller.workTargets(request,{enviId:7,systemRoleId:6} as any,{projectOurIds:['P']})).rejects.toMatchObject({code:'SCOPE_DENIED'});
    expect(GuardRepository.prototype.sourceOperations).not.toHaveBeenCalled();
});
it.each([{offers:[]},{offers:[{Id:901}]}])('missing/dangling actual offer identity rejects before operations %j',async ({offers})=>{
    (GuidanceRepository.prototype.milestones as jest.Mock).mockResolvedValue([{Id:1,ContractId:null,OfferId:900},{Id:2,ContractId:null,OfferId:900}]);
    (GuidanceRepository.prototype.offers as jest.Mock).mockResolvedValue(offers);
    await expect(Controller.workTargets(request,{enviId:7,systemRoleId:4} as any)).rejects.toMatchObject({code:'OBJECT_NOT_FOUND'});expect(GuardRepository.prototype.sourceOperations).not.toHaveBeenCalled();
});

import History from '../ConsolidationHistoryController';
it('resolves the exact case-only retired UI request without an empty IN query',async()=>{
    (GuardRepository.prototype.caseParents as jest.Mock).mockResolvedValue([]);
    (GuidanceRepository.prototype.milestones as jest.Mock).mockRestore();
    const redirect={retired:true,sourceCaseId:1900100001,sourceMilestoneId:1900100001,destinationMilestoneId:1900100002,destinationCaseId:1900101008,destinationMilestoneName:'Cel',destinationCaseName:'Sprawa'};
    jest.spyOn(History,'inTransaction').mockResolvedValue(redirect);
    conn.query.mockImplementation(async(sql:string,args:any[])=>{if(sql.includes(' IN (?)')&&args?.[0]?.length===0)throw Error('ER_PARSE_ERROR_EMPTY_IN');return [[]];});
    await expect(Controller.workTargets({caseIds:[1900100001],milestoneIds:[]},{enviId:7,systemRoleId:1} as any,{projectOurIds:['P']})).resolves.toEqual({blocked:true,redirects:[redirect]});
    expect(History.inTransaction).toHaveBeenCalledWith('case',1900100001,expect.anything(),{projectOurIds:['P']},conn);
    expect(conn.query.mock.calls.some(([sql]:any[])=>String(sql).includes('FROM Milestones'))).toBe(false);
    expect(GuardRepository.prototype.sourceOperations).not.toHaveBeenCalled();
});
it('empty milestones repository query performs no SQL',async()=>{
    (GuidanceRepository.prototype.milestones as jest.Mock).mockRestore();
    await expect(new GuidanceRepository().milestones([],conn)).resolves.toEqual([]);
    expect(conn.query).not.toHaveBeenCalled();
});


import express from 'express';
import { createServer } from 'http';
import { AddressInfo } from 'net';
import Tools from '../../../../tools/Tools';
it.each([false, true])('JSON transport for one ordinary letter case retains consolidation blocked=%s', async blocked => {
    (GuardRepository.prototype.caseParents as jest.Mock).mockResolvedValue([{ Id: 10, MilestoneId: 1 }]);
    (GuidanceRepository.prototype.milestones as jest.Mock).mockResolvedValue([{ Id: 1, ContractId: 100, OfferId: null }]);
    (GuardRepository.prototype.sourceOperations as jest.Mock).mockResolvedValue(blocked ? [{ OperationId: 'active', SourceMilestoneId: 1 }] : []);
    const app = express(); app.use(express.json());
    app.post('/milestone-consolidations/work-targets', async (req, res) => {
        try { res.json(await Controller.workTargets(Tools.parseObjectsJSON(req.body), { enviId: 7, systemRoleId: 1 } as any)); }
        catch (error: any) { res.status(error.status || 500).json({ error: { code: error.code } }); }
    });
    const server = createServer(app);
    try {
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const response = await fetch('http://127.0.0.1:' + (server.address() as AddressInfo).port + '/milestone-consolidations/work-targets',
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ caseIds: [10], milestoneIds: [] }) });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ blocked });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
