import Dates from '../../../contracts/milestones/cases/milestoneDate/MilestoneDatesController';
import Notes from '../../../contractMeetingNotes/ContractMeetingNotesController';
import NoteRepo from '../../../contractMeetingNotes/ContractMeetingNoteRepository';
import ToolsGd from '../../../tools/ToolsGd';
import Scope, {ForbiddenError} from '../ProjectScopeGuard';
const scope={projectOurIds:['ALLOWED']};
beforeEach(()=>{jest.restoreAllMocks();(Notes as any).instance=undefined;});
it.each(['edit','delete'])('date DTO uses strict URL ID before %s',async method=>{
    const writer=jest.spyOn(Dates,method as 'edit').mockResolvedValue({id:12} as any);
    const dto={id:999,milestoneId:3,startDate:'2026-01-01',endDate:'2026-01-02',_fieldsToUpdate:['description']};
    const user={enviId:1} as any;
    await Dates[method==='edit'?'editFromDto':'deleteFromDto']('12',dto,user);
    expect(writer.mock.calls[0][0].id).toBe(12);
    if(method==='edit') expect(writer.mock.calls[0][2]).toEqual(['description']);
    writer.mockClear();
    await expect(Dates[method==='edit'?'editFromDto':'deleteFromDto']('12x',dto,user)).rejects.toMatchObject({status:400});
    expect(writer).not.toHaveBeenCalled();
    await expect(Dates[method==='edit'?'editFromDto':'deleteFromDto']('12',dto,undefined)).rejects.toThrow('User data');
    expect(writer).not.toHaveBeenCalled();
});
function noteSetup(rows:any[]){
    const note={id:12,contractId:1,meetingId:7,protocolGdId:'doc-1'};
    jest.spyOn(NoteRepo.prototype,'find').mockResolvedValueOnce([note] as any).mockResolvedValueOnce(rows as any);
    const check=jest.spyOn(Scope,'assertContractInScope').mockImplementation(async id=>{if(id===999)throw new ForbiddenError();});
    const auth=jest.spyOn(Notes as any,'withAuth').mockImplementation(async(fn:any)=>fn({},{}));
    const trash=jest.spyOn(ToolsGd,'trashFile').mockResolvedValue('ok' as any);
    const remove=jest.spyOn(NoteRepo.prototype,'deleteByMeetingIdInDb').mockResolvedValue(undefined as any);
    return {check,auth,trash,remove};
}
it('denies whole meeting delete before auth if any sibling is out of scope',async()=>{
    const mocks=noteSetup([{id:12,contractId:1},{id:13,contractId:999}]);
    await expect(Notes.deleteById(12,scope)).rejects.toMatchObject({status:403});
    expect(mocks.auth).not.toHaveBeenCalled();expect(mocks.trash).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
});
it.each([{rows:[]},{rows:[{id:13,contractId:1}]}])('denies missing cascade selection before auth %j',async({rows})=>{
    const mocks=noteSetup(rows as any);
    await expect(Notes.deleteById(12,scope)).rejects.toThrow();expect(mocks.auth).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
});
it('keeps whole meeting deletion when all siblings are authorized',async()=>{
    const mocks=noteSetup([{id:12,contractId:1,protocolGdId:'doc-1'},{id:13,contractId:2,protocolGdId:'doc-1'}]);
    await Notes.deleteById(12,scope);
    expect(mocks.check).toHaveBeenCalledWith(1,scope);expect(mocks.check).toHaveBeenCalledWith(2,scope);
    expect(mocks.trash).toHaveBeenCalledTimes(1);expect(mocks.remove).toHaveBeenCalledWith(7);
});
