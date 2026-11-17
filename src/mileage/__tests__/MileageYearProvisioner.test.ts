import { google } from 'googleapis';
import MileageYearProvisioner,{MILEAGE_HEADERS} from '../MileageYearProvisioner';
jest.mock('googleapis',()=>({google:{drive:jest.fn(),sheets:jest.fn()}}));
function fixture() {
    const files={list:jest.fn(),get:jest.fn(),create:jest.fn()};
    const sheets={spreadsheets:{get:jest.fn(),batchUpdate:jest.fn()}};
    (google.drive as jest.Mock).mockReturnValue({files});(google.sheets as jest.Mock).mockReturnValue(sheets);
    const p=new MileageYearProvisioner({} as any);
    const r:any={Year:2027,SpreadsheetId:'new',FolderId:'folder',FileName:'08. Ewidencja przebiegu pojazdów 2027 ENVI SC',OperationId:'op',State:'CREATING',SourceYear:2026};
    const header=()=>({properties:{sheetId:1},data:[{rowData:[{values:MILEAGE_HEADERS.map(t=>({userEnteredValue:{stringValue:t}}))}]}]});
    return {files,sheets,p,r,header};
}
it('duplicates block even across pagination',async()=>{const f=fixture();f.files.list.mockResolvedValueOnce({data:{files:[{id:'a',name:'manual 2027'}],nextPageToken:'next'}}).mockResolvedValueOnce({data:{files:[{id:'b',name:'renamed 2027'}]}});await expect(f.p.candidates(f.r)).rejects.toMatchObject({code:'MILEAGE_STRUCTURE_CONFLICT'})});
it('locally detects renamed year while excluding a date prefix',async()=>{const f=fixture();f.files.list.mockResolvedValue({data:{files:[{id:'other',name:'TEST cash 20260924'},{id:'same',name:'renamed annual 2027'}]}});expect(await f.p.candidates(f.r)).toEqual(['same']);expect(f.files.list.mock.calls[0][0].q).toContain("'folder' in parents")});
it('mismatched op marker or parent blocks ownership',async()=>{const f=fixture();f.files.get.mockResolvedValue({data:{id:'new',name:f.r.FileName,parents:['folder'],mimeType:'application/vnd.google-apps.spreadsheet',appProperties:{mileageOperation:'other',mileageYear:'2027'}}});await expect(f.p.assertFile(f.r,true)).rejects.toThrow('własności')});
it('source requires exact J/K order',()=>{const f=fixture();const h=f.header();[h.data[0].rowData[0].values[9],h.data[0].rowData[0].values[10]]=[h.data[0].rowData[0].values[10],h.data[0].rowData[0].values[9]];expect(()=>f.p.validateHeader(h)).toThrow('J i K')});
for(const [label,column,row,cell] of [['trip',0,1,{userEnteredValue:{numberValue:1}}],['extra formula',20,3,{userEnteredValue:{formulaValue:'=1'}}],['private note',15,4,{note:'private'}],['header note',0,0,{note:'private'}]] as any[]) it(`clean audit rejects ${label}`,async()=>{const f=fixture();const sheet:any=f.header();sheet.developerMetadata=[{metadataKey:'mileageCar',metadataValue:'op:1',location:{sheetId:1}}];if(row===0&&column===0)sheet.data[0].rowData[0].values[0].note='private';else sheet.data.push({startRow:row,startColumn:column,rowData:[{values:[cell]}]});f.sheets.spreadsheets.get.mockResolvedValue({data:{sheets:[sheet]}});await expect(f.p.verifyMappings(f.r,[{Year:2027,CarId:1,SheetGid:1,PlateSnapshot:'x'}],true)).rejects.toThrow('dane')});
it('READY verification permits real trips and does not mutate',async()=>{const f=fixture();const sheet:any=f.header();sheet.developerMetadata=[{metadataKey:'mileageCar',metadataValue:'op:1',location:{sheetId:1}}];sheet.data[0].rowData.push({values:[{userEnteredValue:{numberValue:1}}]});f.sheets.spreadsheets.get.mockResolvedValue({data:{sheets:[sheet]}});await f.p.verifyMappings(f.r,[{Year:2027,CarId:1,SheetGid:1,PlateSnapshot:'x'}],false);expect(f.sheets.spreadsheets.batchUpdate).not.toHaveBeenCalled()});

it('seed audit refuses unmapped extra source tabs without clearing history',async()=>{const f=fixture();f.r.SourceYear=null;f.sheets.spreadsheets.get.mockResolvedValue({data:{sheets:[f.header(),{properties:{sheetId:99}}]}});await expect(f.p.verifyMappings(f.r,[{Year:2026,CarId:1,SheetGid:1,PlateSnapshot:'x'}],false,true)).rejects.toThrow('Nadmiarowe');expect(f.sheets.spreadsheets.batchUpdate).not.toHaveBeenCalled()});
