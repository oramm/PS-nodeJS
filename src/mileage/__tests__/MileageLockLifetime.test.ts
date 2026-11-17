jest.mock('../../tools/ToolsDb',()=>({__esModule:true,default:{getPoolConnectionWithTimeout:jest.fn()}}));
import ToolsDb from '../../tools/ToolsDb';
import MileageYearController from '../MileageYearController';
const config={folderId:'test',seedYear:2026,seedSpreadsheetId:'seed',seedSeries:7};
afterEach(()=>jest.restoreAllMocks());
it.each([false,true])('retains advisory lock through callback and releases after success/failure %s',async(fail)=>{
    let locked=false;const events:string[]=[];
    const connection:any={query:jest.fn(async(sql:string)=>{if(sql.includes('DATABASE'))return [[{Name:'scratch'}]];if(sql.includes('GET_LOCK')){locked=true;events.push('lock');return [[{Locked:1}]];}if(sql.includes('RELEASE_LOCK')){locked=false;events.push('unlock');return [[]];}throw Error('unexpected SQL');}),release:jest.fn(()=>events.push('release'))};
    (ToolsDb.getPoolConnectionWithTimeout as jest.Mock).mockResolvedValue(connection);
    jest.spyOn(MileageYearController,'prepare').mockImplementation(async()=>{expect(locked).toBe(true);events.push('prepare');return {year:{} as any,mappings:[]};});
    const run=MileageYearController.withYear({} as any,2027,1,async()=>{expect(locked).toBe(true);events.push('write');await Promise.resolve();expect(locked).toBe(true);if(fail)throw Error('write failed');return 'saved';},config);
    if(fail)await expect(run).rejects.toThrow('write failed');else await expect(run).resolves.toBe('saved');
    expect(events).toEqual(['lock','prepare','write','unlock','release']);expect(connection.query.mock.calls.filter((c:any)=>c[0].includes('GET_LOCK'))).toHaveLength(1);
});
