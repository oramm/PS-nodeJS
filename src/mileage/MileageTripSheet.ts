import { createHash } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import ToolsSheets from '../tools/ToolsSheets';
import { MileageYearError } from './MileageYear';

export type MileageDestination = { spreadsheetId: string; gid: number };
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const error = (message: string): never => { throw new MileageYearError('MILEAGE_STRUCTURE_CONFLICT', message); };
export default class MileageTripSheet {
    constructor(private readonly auth: OAuth2Client) {}
    private rowCounts = new Map<string, number>();
    async title(destination: MileageDestination): Promise<string> {
        const result = await ToolsSheets.getSpreadSheet(this.auth, destination.spreadsheetId);
        const sheet = result.data.sheets?.find(s => s.properties?.sheetId === destination.gid);
        if (!sheet?.properties?.title) return error('Nie znaleziono zakładki pojazdu.');
        this.rowCounts.set(`${destination.spreadsheetId}:${destination.gid}`, sheet.properties.gridProperties?.rowCount ?? 1000);
        return quote(sheet.properties.title);
    }
    async reading(destination: MileageDestination): Promise<number | null> {
        const title = await this.title(destination);
        const response = await ToolsSheets.getValues(this.auth, { spreadsheetId: destination.spreadsheetId, rangeA1: `${title}!G2:G`, valueRenderOption: 'UNFORMATTED_VALUE' });
        const values = response.values ?? [];
        const last = values.map(row => row[0]).filter(value => value !== undefined && value !== null && value !== '').pop();
        if (last === undefined) return null;
        if ((typeof last !== 'number' && (typeof last !== 'string' || !/^\d+$/.test(last.trim()))) || !Number.isSafeInteger(Number(last)) || Number(last) < 0) return error('Ostatni stan końcowy w arkuszu nie jest prawidłową liczbą. Sprawdź kolumnę G.');
        return Number(last);
    }
    async write(destination: MileageDestination, data: (string | number)[], requestId: string | undefined, identity: string, fueling: boolean) {
        const api = google.sheets({ version: 'v4', auth: this.auth });
        const hash = createHash('sha256').update(JSON.stringify([identity, data])).digest('hex');
        const key = `enviMileageTrip_${createHash('sha256').update(requestId ?? hash).digest('hex')}`;
        // Failure of this read is UNKNOWN, never absence: it must propagate without writing.
        const matches = await api.spreadsheets.developerMetadata.search({ spreadsheetId: destination.spreadsheetId, requestBody: { dataFilters: [{ developerMetadataLookup: { metadataKey: key } }] } });
        const existing = matches.data.matchedDeveloperMetadata ?? [];
        if (existing.length > 1) return error('Niejednoznaczny znacznik zapisu kilometrówki.');
        if (existing.length) {
            let result: { hash: string; lp: number; km: number };
            try { result = JSON.parse(existing[0].developerMetadata?.metadataValue ?? ''); } catch { return error('Nieprawidłowy znacznik zapisu kilometrówki.'); }
            const location = existing[0].developerMetadata?.location?.dimensionRange;
            if (result.hash !== hash || location?.sheetId !== destination.gid) throw new MileageYearError('TRIP_RETRY_CONFLICT', 'Ten identyfikator zapisu został już użyty dla innego wpisu.');
            if (!Number.isSafeInteger(result.lp) || result.lp < 1 || !Number.isSafeInteger(result.km)) return error('Nieprawidłowy wynik zapisanego wpisu.');
            return { lp: result.lp, km: result.km, duplicate: true };
        }
        const title = await this.title(destination);
        const response = await ToolsSheets.getValues(this.auth, { spreadsheetId: destination.spreadsheetId, rangeA1: `${title}!A2:K`, valueRenderOption: 'UNFORMATTED_VALUE' });
        const values = response.values ?? [];
        let lp = 0;
        for (const row of values) {
            if (!row.some(value => value !== '' && value !== null && value !== undefined)) continue;
            if (!Number.isSafeInteger(Number(row[0])) || Number(row[0]) <= lp) return error('Numeracja istniejących wpisów jest nieprawidłowa. Sprawdź arkusz przed dodaniem trasy.');
            lp = Number(row[0]);
        }
        lp++;
        const km = Number(data[5]) - Number(data[4]);
        const rowIndex = values.length + 1;
        const range = { sheetId: destination.gid, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 };
        const storedData = [...data];
        for (const column of [0, 8]) if (storedData[column]) storedData[column] = Date.parse(String(storedData[column])) / 86400000 + 25569;
        const cells = [lp, ...storedData].map(value => ({ userEnteredValue: typeof value === 'number' ? { numberValue: value } : { stringValue: value }, ...(fueling ? { userEnteredFormat: { backgroundColor: { red: 1, green: 0.9490196, blue: 0.8 } } } : {}) }));
        // One atomic batch: retry marker, trip and fueling format either all commit or none.
        const rowCount = this.rowCounts.get(`${destination.spreadsheetId}:${destination.gid}`)!;
        await ToolsSheets.batchUpdateSheet(this.auth, [
            ...(rowIndex >= rowCount ? [{ appendDimension: { sheetId: destination.gid, dimension: 'ROWS', length: rowIndex - rowCount + 1 } }] : []),
            { updateCells: { start: { sheetId: destination.gid, rowIndex, columnIndex: 0 }, rows: [{ values: cells }], fields: fueling ? 'userEnteredValue,userEnteredFormat.backgroundColor' : 'userEnteredValue' } },
            ...[1, 9].map(column => ({ repeatCell: { range: { sheetId: destination.gid, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: column, endColumnIndex: column + 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern: 'yyyy-mm-dd' } } }, fields: 'userEnteredFormat.numberFormat' } })),
            ...(fueling ? [{ repeatCell: { range: { sheetId: destination.gid, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 10, endColumnIndex: 11 }, cell: { userEnteredFormat: { numberFormat: { type: 'NUMBER', pattern: '0' } } }, fields: 'userEnteredFormat.numberFormat' } }] : []),
            { createDeveloperMetadata: { developerMetadata: { metadataKey: key, metadataValue: JSON.stringify({ hash, lp, km }), visibility: 'DOCUMENT', location: { dimensionRange: range } } } },
        ], destination.spreadsheetId);
        return { lp, km, duplicate: false };
    }
}
