jest.mock('googleapis', () => ({ google: { sheets: jest.fn() } }));
jest.mock('../../tools/Tools', () => ({ __esModule: true, default: {} }));
jest.mock('../../tools/ToolsDb', () => ({ __esModule: true, default: { getPoolConnectionWithTimeout: jest.fn(), getQueryCallbackAsync: jest.fn() } }));
jest.mock('../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: { setCredentials: jest.fn(), getAccessToken: jest.fn() } }));
jest.mock('../../staff/StaffMemberRepository', () => ({ __esModule: true, default: {} }));
jest.mock('../../persons/PersonsController', () => ({ __esModule: true, default: {} }));
jest.mock('../../persons/projectAssignments/ProjectScopeGuard', () => ({ ForbiddenError: class extends Error {} }));
jest.mock('../../index', () => ({ app: { get: jest.fn(), post: jest.fn() } }));
import { google } from 'googleapis';
import { app } from '../../index';
import ToolsDb from '../../tools/ToolsDb';
import MileageController from '../MileageController';
import MileageYearController from '../MileageYearController';
import MileageValidator from '../MileageValidator';
import MileageTripSheet from '../MileageTripSheet';

const dto = { vehicleId: '1', date: '2027-01-01', projectOurId: '', purpose: 'tankowanie', routeParts: ['Brzeg'], startReading: 100, endReading: 110, requestId: 'test-request-0001' };
let rows: any[][]; let metadata: any[]; let batch: jest.Mock; let search: jest.Mock; let route: any; let getRoute: any; let failAfterWrite: boolean; let query: jest.Mock;
beforeAll(() => { require('../MileageRouters'); route = (app.post as jest.Mock).mock.calls.find(c => c[0] === '/mileage/trip')![1]; getRoute = (app.get as jest.Mock).mock.calls.find(c => c[0] === '/mileage/vehicles')![1]; });
const previous = {...process.env};
beforeEach(() => {
    Object.assign(process.env, { REFRESH_TOKEN:'test', MILEAGE_YEAR_FOLDER_ID:'folder', MILEAGE_SEED_YEAR:'2026', MILEAGE_SEED_SPREADSHEET_ID:'seed', MILEAGE_SEED_SERIES:'7' });
    rows=[]; metadata=[]; failAfterWrite=false;
    search=jest.fn(async (args:any)=>({data:{matchedDeveloperMetadata:metadata.filter(m=>m.developerMetadata.metadataKey===args.requestBody.dataFilters[0].developerMetadataLookup.metadataKey)}}));
    batch=jest.fn(async(args:any)=>{
        const requests=args.requestBody.requests;
        const update=requests.find((r:any)=>r.updateCells)?.updateCells;
        if(update) rows[update.start.rowIndex-1]=update.rows[0].values.map((cell:any)=>cell.userEnteredValue.numberValue??cell.userEnteredValue.stringValue);
        for(const request of requests) if(request.createDeveloperMetadata) metadata.push(request.createDeveloperMetadata);
        if(failAfterWrite) {failAfterWrite=false; throw Error('lost response');}
        return {data:{}};
    });
    (google.sheets as jest.Mock).mockReturnValue({spreadsheets:{developerMetadata:{search},get:jest.fn(async()=>({data:{sheets:[{properties:{sheetId:1,title:'Test'}}]}})),values:{get:jest.fn(async(args:any)=>({data:{values:args.range.endsWith('G2:G')?[[args.spreadsheetId==='seed'?100:rows.at(-1)?.[6]??'']]:rows}}))},batchUpdate:batch}});
    let serial=Promise.resolve();
    jest.spyOn(MileageYearController,'withYear').mockImplementation((async(_a:any,year:number,_id:any,cb:any)=>{const promise=serial.then(()=>cb({year:{SpreadsheetId:year===2026?'seed':'new'},mappings:[{CarId:1,SheetGid:1}]}));serial=promise.catch(()=>{});return promise;}) as any);
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([{Id:1,Brand:'Test',Model:'Car',LicensePlateNumber:'X',MileageSpreadsheetId:'seed',MileageSheetGid:1}]);
    query=jest.fn(async(sql:string,args:any[])=>[sql.includes('FROM MileageYears')?(args[0]===2026?[{Year:2026,State:'READY',SpreadsheetId:'seed',FolderId:'folder',FileName:'07. Ewidencja przebiegu pojazdów 2026 ENVI SC'}]:[]):sql.includes('FROM MileageYearCars')?[{CarId:1,SheetGid:1}]:[]]);
    (ToolsDb.getPoolConnectionWithTimeout as jest.Mock).mockResolvedValue({query,release:jest.fn()});
});
afterEach(()=>jest.restoreAllMocks());
afterAll(()=>{process.env=previous;});
it('first trip is Lp1, atomic data/format/metadata, business date preserved',async()=>{
    const result=await MileageController.addTrip(dto,'Driver'); expect(result).toMatchObject({lp:1,km:10,year:2027,duplicate:false});
    expect(rows[0]).toEqual([1,46388,'','tankowanie','Brzeg',100,110,10,'Driver','','']);
    expect(batch).toHaveBeenCalledTimes(1); expect(batch.mock.calls[0][0].requestBody.requests).toHaveLength(5);
});
it('retry after a lost response returns original number and does not duplicate',async()=>{
    failAfterWrite=true; await expect(MileageController.addTrip(dto,'Driver')).rejects.toThrow('lost response');
    expect(await MileageController.addTrip(dto,'Driver')).toMatchObject({lp:1,duplicate:true});expect(rows).toHaveLength(1);expect(batch).toHaveBeenCalledTimes(1);
});
it('changed payload with same request ID conflicts without write',async()=>{
    await MileageController.addTrip(dto,'Driver');await expect(MileageController.addTrip({...dto,endReading:120},'Driver')).rejects.toMatchObject({code:'TRIP_RETRY_CONFLICT'});expect(batch).toHaveBeenCalledTimes(1);
});
it('legacy caller identical request retries, explicit new ID permits a new entry',async()=>{
    await MileageController.addTrip({...dto,requestId:undefined},'Driver');await MileageController.addTrip({...dto,requestId:undefined},'Driver');await MileageController.addTrip({...dto,requestId:'different-id'},'Driver');expect(rows.map(r=>r[0])).toEqual([1,2]);
});
it('two concurrent submissions have sequential rows under write lock',async()=>{
    await Promise.all([MileageController.addTrip(dto,'Driver'),MileageController.addTrip({...dto,requestId:'second-trip',startReading:110,endReading:130},'Driver')]);expect(rows.map(r=>r[0])).toEqual([1,2]);
});
it('historical date chooses historical destination and returned link',async()=>{
    const result=await MileageController.addTrip({...dto,date:'2026-12-30'},'Driver');expect(result.sheetUrl).toContain('/seed/');expect(batch.mock.calls[0][0].spreadsheetId).toBe('seed');
});
it('metadata read failure is unknown and causes no write',async()=>{
    search.mockRejectedValue(Error('read failed'));await expect(MileageController.addTrip(dto,'Driver')).rejects.toThrow('read failed');expect(batch).not.toHaveBeenCalled();
});
it('a rejected batch reaches route error handler with no false success',async()=>{
    batch.mockRejectedValue(Error('rejected'));const res={send:jest.fn()};const next=jest.fn();await route({parsedBody:dto,session:{userData:{enviId:1,userName:'Driver',systemRoleName:'ADMIN'}}},res,next);expect(res.send).not.toHaveBeenCalled();expect(next).toHaveBeenCalledWith(expect.objectContaining({message:'rejected'}));
});
it.each([null,{}, {...dto,date:'2027-02-29'}, {...dto,date:['2027-01-01']}, {...dto,startReading:null}, {...dto,startReading:'100'}, {...dto,startReading:-1}, {...dto,endReading:NaN}, {...dto,endReading:Infinity}, {...dto,endReading:99}, {...dto,endReading:110.5}, {...dto,vehicleId:'1 OR 1'}, {...dto,driver:123}, {...dto,routeParts:[1]}, {...dto,fuelingReading:'abc'}])('invalid DTO rejects before any external operation %j',async(input)=>{
    await expect(MileageController.addTrip(input as any,'Driver')).rejects.toMatchObject({code:'INVALID_TRIP'});expect(MileageYearController.withYear).not.toHaveBeenCalled();expect(batch).not.toHaveBeenCalled();
});
it('GET uncreated year carries previous G with null destination and only SELECTs',async()=>{
    expect(await MileageController.getVehicles('2027-01-01')).toEqual([{id:1,brand:'Test',model:'Car',plate:'X',currentReading:100,sheetUrl:null,year:2027}]);expect(query.mock.calls.every(call=>call[0].startsWith('SELECT'))).toBe(true);expect(MileageYearController.withYear).not.toHaveBeenCalled();expect(batch).not.toHaveBeenCalled();
});
it('GET populated year uses current G even after previous year changes',async()=>{
    query.mockImplementation(async(sql:string,args:any[])=>[sql.includes('FROM MileageYears')?[{Year:args[0],State:'READY',SpreadsheetId:args[0]===2026?'seed':'new',FolderId:'folder',FileName:args[0]===2026?'07. Ewidencja przebiegu pojazdów 2026 ENVI SC':'08. Ewidencja przebiegu pojazdów 2027 ENVI SC'}]:[{CarId:1,SheetGid:1}]]);
    rows=[[1,'2027-01-01','','','','',150]];expect((await MileageController.getVehicles('2027-02-01'))[0]).toMatchObject({currentReading:150,sheetUrl:expect.stringContaining('/new/')});expect(query.mock.calls.some(c=>c[1][0]===2026)).toBe(false);
});
it('new car remains visible with null reading and link; inactive filters absent',async()=>{
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([{Id:2,Brand:'New',Model:'',LicensePlateNumber:'N',MileageSpreadsheetId:null,MileageSheetGid:null}]);expect((await MileageController.getVehicles('2027-01-01'))[0]).toMatchObject({id:2,currentReading:null,sheetUrl:null});expect((ToolsDb.getQueryCallbackAsync as jest.Mock).mock.calls[0][0]).not.toContain('IsActive');
});
it('invalid G is a visible error, never a guessed number',async()=>{
    const api=(google.sheets as jest.Mock)();api.spreadsheets.values.get.mockResolvedValue({data:{values:[['error 123']]}});await expect(new MileageTripSheet({} as any).reading({spreadsheetId:'seed',gid:1})).rejects.toMatchObject({code:'MILEAGE_STRUCTURE_CONFLICT'});
});
it('Warsaw default date crosses year at Polish midnight',()=>{jest.useFakeTimers().setSystemTime(new Date('2026-12-31T23:30:00Z'));expect(MileageValidator.businessDate()).toBe('2027-01-01');jest.useRealTimers();});

it('extends a full grid atomically and applies date formats on the new row',async()=>{
    const api=(google.sheets as jest.Mock)();api.spreadsheets.get.mockResolvedValue({data:{sheets:[{properties:{sheetId:1,title:'Test',gridProperties:{rowCount:2}}}]}});
    rows=[[1,46000,'','','',90,100]]; await MileageController.addTrip(dto,'Driver');
    const requests=batch.mock.calls[0][0].requestBody.requests;expect(requests[0]).toEqual({appendDimension:{sheetId:1,dimension:'ROWS',length:1}});
    expect(requests.filter((r:any)=>r.repeatCell?.cell?.userEnteredFormat?.numberFormat?.type==='DATE')).toHaveLength(2);expect(rows[1][1]).toBe(46388);
});
it('route passes invalid business date query as HTTP400 without write',async()=>{
    const res:any={status:jest.fn().mockReturnThis(),send:jest.fn()};await getRoute({query:{date:'bad'},session:{userData:{enviId:1,userName:'Driver',systemRoleName:'ADMIN'}}},res,jest.fn());expect(res.status).toHaveBeenCalledWith(400);expect(res.send).toHaveBeenCalledWith(expect.objectContaining({code:'INVALID_TRIP'}));expect(batch).not.toHaveBeenCalled();
});
