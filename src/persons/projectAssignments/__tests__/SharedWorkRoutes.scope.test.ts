jest.mock('../../../index', () => ({ app: { post: jest.fn(), put: jest.fn(), delete: jest.fn(), use: jest.fn() } }));
jest.mock('../../../contracts/milestones/cases/CasesController', () => ({ __esModule: true, default: { addFromDto: jest.fn(), editFromDto: jest.fn(), deleteFromDto: jest.fn() } }));
jest.mock('../../../meetings/meetingArrangements/MeetingArrangementsController', () => ({ __esModule: true, default: { addFromDto: jest.fn(), editFromDto: jest.fn(), updateStatus: jest.fn(), deleteById: jest.fn() } }));
jest.mock('../../../contractMeetingNotes/ContractMeetingNotesController', () => ({ __esModule: true, default: { addFromDto: jest.fn(), editFromDto: jest.fn(), deleteById: jest.fn() } }));
jest.mock('../../../tools/ToolsDb', () => ({ __esModule: true, default: { getQueryCallbackAsync: jest.fn() } }));
import { app } from '../../../index';
import Db from '../../../tools/ToolsDb';
import Cases from '../../../contracts/milestones/cases/CasesController';
import Arrangements from '../../../meetings/meetingArrangements/MeetingArrangementsController';
import Notes from '../../../contractMeetingNotes/ContractMeetingNotesController';
import CaseValidator from '../../../contracts/milestones/cases/CaseValidator';
import RouteIdValidator from '../../../tools/RouteIdValidator';
import '../../../contracts/milestones/cases/CasesRouters';
import '../../../meetings/meetingArrangements/MeetingArrangementsRouters';
import '../../../contractMeetingNotes/ContractMeetingNotesRouters';
const routes = Object.fromEntries(['post', 'put', 'delete'].flatMap(verb => (app[verb as 'post'] as jest.Mock).mock.calls.map(([route, handler]) => [verb+' '+route, handler])));
const scope = { projectOurIds: ['ALLOWED'] };
const calls = [Cases.addFromDto, Cases.editFromDto, Cases.deleteFromDto, Arrangements.addFromDto, Arrangements.editFromDto, Arrangements.updateStatus, Arrangements.deleteById, Notes.addFromDto, Notes.editFromDto, Notes.deleteById] as jest.Mock[];
async function invoke(route: string, body: any, id='12', scoped=true) {
    const next=jest.fn(), send=jest.fn();
    await routes[route]({params:{id},body,parsedBody:body,projectScope:scoped?scope:undefined,session:{userData:{enviId:1}}},{send},next);
    return {next,send};
}
beforeEach(() => {
    jest.clearAllMocks();
    (Cases.addFromDto as jest.Mock).mockResolvedValue({caseItem:{id:12}});
    (Db.getQueryCallbackAsync as jest.Mock).mockImplementation(async (_sql, _conn, [id]) => id===999 ? [{ProjectOurId:'FOREIGN'}] : id===404 ? [] : [{ProjectOurId:'ALLOWED'}]);
});
it.each([
    ['post /case',{_parent:{id:999}}],
    ['post /case',{_parent:{id:1},parentCaseId:999}],
    ['put /case/:id',{_parent:{id:999},_fieldsToUpdate:['milestoneId']}],
    ['put /case/:id',{_parent:{id:1},parentCaseId:999,_fieldsToUpdate:['parentCaseId']}],
    ['post /meetingArrangement',{caseId:1,meetingId:999}],
    ['post /meetingArrangement',{caseId:0,_case:{id:999},meetingId:1}],
    ['put /meetingArrangement/:id',{caseId:999}],
    ['put /meetingArrangement/:id',{meetingId:999}],
    ['post /contractMeetingNote',{contractId:1,meetingId:999}],
    ['put /contractMeetingNote/:id',{contractId:999}],
    ['put /contractMeetingNote/:id',{contractId:1,meetingId:999}],
    ['put /contractMeetingNote/:id',{}],
])('refuses actual out-of-scope destination before writer: %s %j', async(route,body)=>{
    const {next}=await invoke(route,body);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));
    for(const fn of calls) expect(fn).not.toHaveBeenCalled();
});
it.each(['put /case/:id','delete /case/:id','put /meetingArrangement/:id','put /meetingArrangement/:id/status','delete /meetingArrangement/:id','put /contractMeetingNote/:id','delete /contractMeetingNote/:id'])('refuses unavailable saved object: %s',async route=>{
    for(const id of ['999','404']) {
        const {next}=await invoke(route,{contractId:1},id);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({status:403}));
    }
    for(const fn of calls) expect(fn).not.toHaveBeenCalled();
});
it('ignores unselected case relations and null parent, preserves URL identity',async()=>{
    const body={id:999,_parent:{id:999},parentCaseId:999,status:'NEW',_fieldsToUpdate:['status']};
    expect((await invoke('put /case/:id',body)).next).not.toHaveBeenCalled();
    expect(Cases.editFromDto).toHaveBeenCalledWith({...body,id:12},undefined,['status']);
    expect(Db.getQueryCallbackAsync).toHaveBeenCalledTimes(1);
    expect(CaseValidator.selectedParents({parentCaseId:null},['parentCaseId']).parentCaseId).toBeUndefined();
});
it.each([
    ['post /case',{_parent:{id:1},parentCaseId:2},Cases.addFromDto],
    ['put /case/:id',{_parent:{id:1},parentCaseId:2},Cases.editFromDto],
    ['post /meetingArrangement',{caseId:1,meetingId:2},Arrangements.addFromDto],
    ['put /meetingArrangement/:id',{caseId:1,meetingId:2},Arrangements.editFromDto],
    ['post /contractMeetingNote',{contractId:1,meetingId:2},Notes.addFromDto],
    ['put /contractMeetingNote/:id',{contractId:1,meetingId:2},Notes.editFromDto],
])('allows assigned destinations: %s',async(route,body,writer)=>{
    expect((await invoke(route,body)).next).not.toHaveBeenCalled(); expect(writer).toHaveBeenCalled();
});
it('forwards scope for whole meeting note deletion',async()=>{
    await invoke('delete /contractMeetingNote/:id',{id:999});
    expect(Notes.deleteById).toHaveBeenCalledWith(12,scope);
});
it('keeps unrestricted role behavior with no scope queries',async()=>{
    await invoke('put /meetingArrangement/:id',{caseId:999,meetingId:999},'12',false);
    expect(Db.getQueryCallbackAsync).not.toHaveBeenCalled();expect(Arrangements.editFromDto).toHaveBeenCalled();
});
it.each(['','0','-1','12x','1.2',' 12','1e2','9007199254740992'])('rejects invalid URL ID %j for unrestricted users before writer',async id=>{
    const {next}=await invoke('put /case/:id',{_parent:{id:1}},id,false);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({status:400}));
    expect(Cases.editFromDto).not.toHaveBeenCalled();
    expect(()=>RouteIdValidator.positiveId(id)).toThrow();
});
