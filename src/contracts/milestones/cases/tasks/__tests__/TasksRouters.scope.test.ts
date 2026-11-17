jest.mock('../../../../../index', () => ({ app: {post:jest.fn(),put:jest.fn(),delete:jest.fn()} }));
jest.mock('../TasksController', () => ({ __esModule:true,default:{add:jest.fn(),edit:jest.fn(),delete:jest.fn(),find:jest.fn()} }));
jest.mock('../../../../../persons/projectAssignments/ProjectScopeGuard', () => ({ __esModule:true,default:{assertCaseInScope:jest.fn(),assertTaskInScope:jest.fn()} }));
import { app } from '../../../../../index';
import Tasks from '../TasksController';
import Scope from '../../../../../persons/projectAssignments/ProjectScopeGuard';
import '../TasksRouters';

const handler=(verb:'post'|'put'|'delete',path:string)=>(app[verb] as jest.Mock).mock.calls.find(([route])=>route===path)[1];
const scope={projectIds:['synthetic']};
beforeEach(()=>{ jest.clearAllMocks(); });
// Store handlers before clearing registration mock calls.
const add=handler('post','/task'), edit=handler('put','/task/:id'), remove=handler('delete','/task/:id');
it('checks the effective create parent, not unrelated parent fields', async()=>{
    const next=jest.fn(), body={_case:{id:100},_parent:{id:200},caseId:300};
    await add({body,projectScope:scope},{send:jest.fn()},next);
    expect(Scope.assertCaseInScope).toHaveBeenCalledWith(100,scope); expect(Tasks.add).toHaveBeenCalledWith(body); expect(next).not.toHaveBeenCalled();
});
it.each(['edit','delete'])('uses the scoped URL ID for %s despite a forged body ID', async mode=>{
    const next=jest.fn(), body={id:999,_fieldsToUpdate:['status']};
    await (mode==='edit'?edit:remove)({params:{id:'12'},body,parsedBody:body,projectScope:scope},{send:jest.fn()},next);
    expect(Scope.assertTaskInScope).toHaveBeenCalledWith(12,scope);
    expect((mode==='edit'?Tasks.edit:Tasks.delete) as jest.Mock).toHaveBeenCalledWith(...(mode==='edit'?[{...body,id:12},['status']]:[{...body,id:12}]));
    expect(next).not.toHaveBeenCalled();
});
it('refuses an out-of-scope selected destination before mutation', async()=>{
    (Scope.assertCaseInScope as jest.Mock).mockRejectedValueOnce(new Error('forbidden'));
    const next=jest.fn();
    await edit({params:{id:'12'},parsedBody:{_case:{id:200},_fieldsToUpdate:['caseId']},projectScope:scope},{send:jest.fn()},next);
    expect(Scope.assertCaseInScope).toHaveBeenCalledWith(200,scope); expect(Tasks.edit).not.toHaveBeenCalled(); expect(next).toHaveBeenCalled();
});
it('does not check an unselected destination while editing hours',async()=>{
    await edit({params:{id:'12'},parsedBody:{_case:{id:999},hoursMon:2,_fieldsToUpdate:['hoursMon']},projectScope:scope},{send:jest.fn()},jest.fn());
    expect(Scope.assertCaseInScope).not.toHaveBeenCalled(); expect(Tasks.edit).toHaveBeenCalled();
});
