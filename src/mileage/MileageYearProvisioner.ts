import { OAuth2Client } from 'google-auth-library';
import { google, sheets_v4 } from 'googleapis';
import { MileageCar, MileageYear, MileageYearCar, MileageYearError } from './MileageYear';

export const MILEAGE_HEADERS = ['Lp.', 'Data wyjazdu', 'kod Projektu', 'Cel wyjazdu', 'Opis trasy (skąd - dokąd)', 'Stan licznika początkowy', 'Stan licznika końcowy', 'Ilość km', 'Kierujący pojazdem', 'data tankowania', 'stan licznika km'];
const conflict = (message: string): never => { throw new MileageYearError('MILEAGE_STRUCTURE_CONFLICT', message); };
const quote = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
export default class MileageYearProvisioner {
    private drive; private sheets;
    constructor(auth: OAuth2Client) { this.drive = google.drive({version:'v3',auth}); this.sheets = google.sheets({version:'v4',auth}); }
    async file(id: string) { return (await this.drive.files.get({fileId:id,supportsAllDrives:true,fields:'id,name,parents,trashed,mimeType,appProperties'})).data; }
    async snapshot(id: string): Promise<sheets_v4.Schema$Spreadsheet> {
        return (await this.sheets.spreadsheets.get({spreadsheetId:id,includeGridData:true,fields:'spreadsheetId,sheets(properties,merges,developerMetadata,data(startRow,startColumn,rowData(values(userEnteredValue,note,textFormatRuns,userEnteredFormat)),columnMetadata(pixelSize)))'})).data;
    }
    async assertFile(record: MileageYear, owned: boolean): Promise<void> {
        if (!record.SpreadsheetId) conflict('Brak identyfikatora pliku kilometrówki.');
        const file = await this.file(record.SpreadsheetId!);
        if (file.trashed || file.mimeType !== 'application/vnd.google-apps.spreadsheet' || file.name !== record.FileName || !file.parents?.includes(record.FolderId)) conflict('Niezgodna tożsamość pliku kilometrówki.');
        if (owned && (file.appProperties?.mileageOperation !== record.OperationId || file.appProperties?.mileageYear !== String(record.Year))) conflict('Brak potwierdzenia własności operacji tworzenia kilometrówki.');
    }
    async candidates(record: MileageYear): Promise<string[]> {
        const ids: string[] = []; let pageToken: string | undefined;
        do {
            const result = (await this.drive.files.list({q:`'${quote(record.FolderId)}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.spreadsheet'`,fields:'nextPageToken,files(id,name,appProperties)',pageSize:100,includeItemsFromAllDrives:true,supportsAllDrives:true,pageToken})).data;
            const yearToken = new RegExp(`(^|[^0-9])${record.Year}([^0-9]|$)`);
            ids.push(...(result.files || []).filter(file=>file.name===record.FileName || yearToken.test(file.name || '') || file.appProperties?.mileageYear===String(record.Year) || file.appProperties?.mileageOperation===record.OperationId).map(file=>file.id!));
            pageToken = result.nextPageToken || undefined;
        } while (pageToken);
        if (ids.length > 1) conflict('Istnieje kilka kandydatów pliku rocznego. Wymagana kontrola operatora.');
        return ids;
    }
    async create(record: MileageYear): Promise<string> {
        const result = await this.drive.files.create({supportsAllDrives:true,fields:'id',requestBody:{name:record.FileName,mimeType:'application/vnd.google-apps.spreadsheet',parents:[record.FolderId],appProperties:{mileageOperation:record.OperationId,mileageYear:String(record.Year)}}});
        if (!result.data.id) conflict('Niepotwierdzony wynik utworzenia pliku.');
        return result.data.id!;
    }
    validateHeader(sheet: sheets_v4.Schema$Sheet): void {
        if (sheet.merges?.length) conflict('Nieobsługiwane scalone komórki kilometrówki.');
        const grid = sheet.data?.find(data=>(data.startRow || 0)===0 && (data.startColumn || 0)===0);
        const row = grid?.rowData?.[0]?.values || [];
        if (MILEAGE_HEADERS.some((text,index)=>row[index]?.userEnteredValue?.stringValue?.trim() !== text)) conflict('Niezgodny nagłówek kilometrówki; sprawdź także kolumny J i K.');
    }
    private marker(sheet: sheets_v4.Schema$Sheet, carId: number, operation: string): boolean {
        return !!sheet.developerMetadata?.some(meta=>meta.metadataKey==='mileageCar' && meta.metadataValue===`${operation}:${carId}` && meta.location?.sheetId===sheet.properties?.sheetId);
    }
    private assertEmpty(sheet: sheets_v4.Schema$Sheet, allowHeader: boolean): void {
        for (const grid of sheet.data || []) for (const [ri,row] of (grid.rowData || []).entries()) for (const [ci,cell] of (row.values || []).entries()) {
            const header = allowHeader && ri+(grid.startRow || 0)===0 && ci+(grid.startColumn || 0)<11;
            if (cell.note || cell.textFormatRuns?.length || (!header && cell.userEnteredValue && Object.keys(cell.userEnteredValue).length)) conflict('Zakładka zawiera dane poza dozwolonym pustym szablonem; nie zostanie wyczyszczona.');
        }
    }
    async verifyMappings(record: MileageYear, mappings: MileageYearCar[], clean: boolean, exactTabs = clean): Promise<void> {
        const snapshot = await this.snapshot(record.SpreadsheetId!);
        for (const mapping of mappings) {
            const sheet = snapshot.sheets?.find(s=>s.properties?.sheetId===mapping.SheetGid);
            if (!sheet) conflict('Brak historycznej zakładki pojazdu.');
            this.validateHeader(sheet!);
            if (record.SourceYear !== null && !this.marker(sheet!,mapping.CarId,record.OperationId)) conflict('Niezgodna trwała tożsamość pojazdu w zakładce.');
            if (clean) this.assertEmpty(sheet!,true);
        }
        if (exactTabs && snapshot.sheets?.length !== mappings.length) conflict('Nadmiarowe zakładki w nowym pliku kilometrówki.');
    }
    async prepare(record: MileageYear, cars: MileageCar[], existing: MileageYearCar[], source: MileageYear, sourceMappings: MileageYearCar[]): Promise<MileageYearCar[]> {
        const sourceSnapshot = await this.snapshot(source.SpreadsheetId!);
        const templates = sourceMappings.map(mapping=>sourceSnapshot.sheets?.find(s=>s.properties?.sheetId===mapping.SheetGid));
        if (!templates.length || templates.some(s=>!s)) conflict('Brak jednoznacznego źródła formatowania kilometrówki.');
        templates.forEach(s=>this.validateHeader(s!));
        const snapshot = await this.snapshot(record.SpreadsheetId!);
        const requests: sheets_v4.Schema$Request[] = [];
        const result = [...existing];
        const expectedIds = new Set(existing.map(m=>m.SheetGid));
        for (const car of cars) {
            if (existing.some(m=>m.CarId===car.Id)) continue;
            if (!Number.isInteger(car.Id) || car.Id<=0 || car.Id>2147483647) conflict('Nieprawidłowy identyfikator pojazdu.');
            const gid = car.Id;
            expectedIds.add(gid);
            const found = snapshot.sheets?.find(s=>s.properties?.sheetId===gid);
            if (found) {
                if (!this.marker(found,car.Id,record.OperationId)) conflict('Identyfikator zakładki jest już zajęty przez inną tożsamość.');
                this.validateHeader(found); this.assertEmpty(found,true);
            } else {
                const template = templates[sourceMappings.findIndex(m=>m.CarId===car.Id)] || templates[0]!;
                const header = template!.data?.[0]?.rowData?.[0]?.values || [];
                requests.push({addSheet:{properties:{sheetId:gid,title:`Auto ${car.Id} - ${car.LicensePlateNumber}`.replace(/[\[\]:*?/\\]/g,' ').slice(0,100),gridProperties:{rowCount:1000,columnCount:11,frozenRowCount:1}}}});
                requests.push({createDeveloperMetadata:{developerMetadata:{metadataKey:'mileageCar',metadataValue:`${record.OperationId}:${car.Id}`,visibility:'DOCUMENT',location:{sheetId:gid}}}});
                requests.push({updateCells:{start:{sheetId:gid,rowIndex:0,columnIndex:0},rows:[{values:MILEAGE_HEADERS.map((text,index)=>({userEnteredValue:{stringValue:text},userEnteredFormat:header[index]?.userEnteredFormat}))}],fields:'userEnteredValue,userEnteredFormat'}});
                // Neutral body: no colors, notes, rich text, formulas or trips copied.
                for (let column=0;column<11;column++) {
                    const pixelSize=template!.data?.[0]?.columnMetadata?.[column]?.pixelSize;
                    if (pixelSize) requests.push({updateDimensionProperties:{range:{sheetId:gid,dimension:'COLUMNS',startIndex:column,endIndex:column+1},properties:{pixelSize},fields:'pixelSize'}});
                }
                for (const column of [1,9]) requests.push({repeatCell:{range:{sheetId:gid,startRowIndex:1,startColumnIndex:column,endColumnIndex:column+1},cell:{userEnteredFormat:{numberFormat:{type:'DATE',pattern:'yyyy-mm-dd'}}},fields:'userEnteredFormat.numberFormat'}});
            }
            result.push({Year:record.Year,CarId:car.Id,SheetGid:gid,PlateSnapshot:car.LicensePlateNumber});
        }
        for (const sheet of snapshot.sheets || []) if (!expectedIds.has(sheet.properties!.sheetId!)) {
            if (record.State==='READY' || existing.length || sheet.properties?.sheetId!==0 || sheet.developerMetadata?.length || snapshot.sheets?.length!==1) conflict('Nieoczekiwana zakładka; potrzebna kontrola operatora.');
            this.assertEmpty(sheet,false);
            requests.push({deleteSheet:{sheetId:0}});
        }
        if (requests.length) await this.sheets.spreadsheets.batchUpdate({spreadsheetId:record.SpreadsheetId!,requestBody:{requests}});
        // Never scrub: verification failure retains the candidate for operator inspection.
        await this.verifyMappings(record,result.filter(m=>!existing.some(e=>e.CarId===m.CarId)),false);
        const after = await this.snapshot(record.SpreadsheetId!);
        for (const mapping of result.filter(m=>!existing.some(e=>e.CarId===m.CarId))) this.assertEmpty(after.sheets!.find(s=>s.properties?.sheetId===mapping.SheetGid)!,true);
        if (record.State!=='READY' && after.sheets?.length!==result.length) conflict('Nieoczekiwana liczba zakładek nowego pliku.');
        return result;
    }
}
