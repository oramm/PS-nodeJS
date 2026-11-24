jest.mock('../../tools/ToolsSheets');
jest.mock('../../setup/Setup', () => ({ __esModule: true, default: { PettyCash: { spreadsheetId: 'cash', registerSpreadsheetId: 'postal', trackingUrlTemplate: '' } } }));
jest.mock('../sheets/sheetsAuth', () => ({ __esModule: true, default: async (auth: any) => auth }));
import Tools from '../../tools/ToolsSheets';
import Controller from '../PettyCashEntryController';
import Cash from '../sheets/PettyCashWriter';
import Postal from '../sheets/PostalRegisterWriter';
import Entry from '../PettyCashEntry';
import Dispatch from '../postal/PostalDispatch';
import Item from '../postal/PostalDispatchItem';

type Tab = { id: number; title: string; rows: string[][] };
let files: Record<string, Tab[]>, failure: string, readsFail: boolean;
const rowCells = (values: any[]) => values.map(cell => { const v = cell.userEnteredValue ?? {}; return String(v.numberValue ?? v.formulaValue ?? v.stringValue ?? ''); });
const entry = (doc = 'TEST/P1', count = 2) => new Entry({ entryKind: 'POSTAL', entryDate: '2027-01-03', description: 'poczta', netAmount: count * 10, grossAmount: count * 10, documentNumber: doc, payerLabel: 'TEST', settlementMethod: 'CASH', _dispatch: new Dispatch({ invoiceNumber: doc, items: Array.from({ length: count }, (_, i) => new Item({ trackingNumber: ['559007734369539067', '559007734369539074'][i], addressee: `TEST ${i}`, contentsDescription: 'TEST', amount: 10 })) }) });
function cashRows(year: number) {
    const rows: string[][] = [[String(year), 'ZALICZKA', 'OPIS', 'NETTO', 'BRUTTO', 'BEZ FV / PARAGON', 'wydatek', 'saldo / Nr faktury', 'kto zapłacił', 'uwaga']];
    for (let m = 1; m <= 12; m++) { const r = rows.length + 1, row = Array(14).fill(''); row[0] = String(Cash.dateToSerial(`${year}-${String(m).padStart(2, '0')}-01`)); for (const c of ['B', 'D', 'E', 'F', 'G']) row[c.charCodeAt(0) - 65] = `=SUM(${c}${r + 1}:${c}${r + 2})`; row[7] = `=B${r}-G${r}+${m === 1 ? "'zaliczki 2025'!H35" : `H${r - 3}`}`; row[8] = 'POZOSTAŁO W PORTFELU'; rows.push(row, [], []); }
    return rows;
}
function postalRows() { const rows = Array.from({ length: 4 }, () => Array(9).fill('')); rows[1][0] = 'rozlicz zaliczkę'; rows[1][2] = 'https://example.invalid/cash'; rows[2][0] = 'ZMIEŃ status fv'; rows[2][2] = 'https://example.invalid/app'; const e = entry('OLD', 2); e.entryDate = '2026-01-03'; return [...rows, ...Postal.buildBlockRows(e, 1, 5, { tracking: 'nr listu', date: 'data ', amount: 'kwota ' }).map(rowCells)]; }
function apply(id: string, requests: any[]) { for (const r of requests) {
    if (r.addSheet) { const p = r.addSheet.properties; files[id].push({ id: p.sheetId, title: p.title, rows: [] }); }
    if (r.insertDimension) { const q = r.insertDimension.range, tab = files[id].find(t => t.id === q.sheetId)!; while (tab.rows.length < q.startIndex) tab.rows.push([]); tab.rows.splice(q.startIndex, 0, ...Array.from({ length: q.endIndex - q.startIndex }, () => [])); }
    if (r.updateCells) { const q = r.updateCells, tab = files[id].find(t => t.id === q.start.sheetId)!; q.rows.forEach((row: any, i: number) => { while (tab.rows.length <= q.start.rowIndex + i) tab.rows.push([]); const target = tab.rows[q.start.rowIndex + i]; rowCells(row.values).forEach((v, c) => target[q.start.columnIndex + c] = v); }); }
} }
const target = (id: string) => files[id].find(t => t.title.includes('2027'))!;
const count = (id: string) => target(id)?.rows.filter(r => id === 'postal' ? /^auto:/.test(r[8] ?? '') : /^auto:/.test(r[13] ?? '')).length ?? 0;
const add = (e = entry()) => Controller.add(e, {} as any);
beforeEach(() => {
    jest.resetAllMocks(); failure = ''; readsFail = false;
    files = { cash: [{ id: 10, title: 'zaliczki 2026', rows: cashRows(2026) }], postal: [{ id: 20, title: 'poczta wych. 2026', rows: postalRows() }] };
    (Tools.getSpreadSheet as jest.Mock).mockImplementation(async (_a, id, options) => {
        if (readsFail) throw new Error('read failed');
        if (options?.ranges) return { data: { sheets: [{
            properties: { sheetId: 20 },
            data: [{ columnMetadata: [45, 61, 321, 334, 324, 120, 100, 120].map(pixelSize => ({ pixelSize })) }],
        }] } };
        return { data: { sheets: files[id].map(t => ({ properties: { title: t.title, sheetId: t.id, gridProperties: { rowCount: 1000 } } })) } };
    });
    (Tools.getValues as jest.Mock).mockImplementation(async (_a, p) => { if (readsFail) throw new Error('read failed'); if (p.valueRenderOption === 'UNFORMATTED_VALUE') return { values: [[500]] }; const title = p.rangeA1.match(/^'([^']+)'!/)[1]; return { values: files[p.spreadsheetId].find(t => t.title === title)!.rows }; });
    (Tools.batchUpdateSheet as jest.Mock).mockImplementation(async (_a, requests, id) => {
        const business = requests.some((r: any) => r.updateCells?.rows.some((row: any) => row.values.some((c: any) => String(c.userEnteredValue?.stringValue ?? '').startsWith('auto:'))));
        if (failure === `${id}:before` && business) { failure = ''; throw new Error('before write'); }
        apply(id, requests);
        if (failure === `${id}:after` && business) { failure = ''; throw new Error('lost response'); }
        if (failure === `${id}:unknown` && business) { readsFail = true; failure = ''; throw new Error('unavailable'); }
        if (failure === `${id}:structure` && requests.some((r: any) => r.addSheet)) { failure = ''; throw new Error('lost structure response'); }
    });
});
it('first block one, second two, retry adds neither row; no old entries copied', async () => {
    const prior = JSON.stringify(files); const a = await add(); expect(a.register).toMatchObject({ action: 'write', blockNumber: 1, headerRow: 5 }); expect(a.cash.action).toBe('write');
    const calls = (Tools.batchUpdateSheet as jest.Mock).mock.calls;
    const provision = calls.find(([, requests, id]) => id === 'postal' && requests.some((request: any) => request.addSheet))![1];
    const widths = provision.filter((request: any) => request.updateDimensionProperties?.fields === 'pixelSize');
    expect(widths.map((request: any) => request.updateDimensionProperties.properties.pixelSize))
        .toEqual([45, 61, 321, 334, 324, 120, 100, 120]);
    expect(widths.map((request: any) => request.updateDimensionProperties.range.startIndex))
        .toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(target('postal').rows[1][2]).toBe('https://example.invalid/cash');
    expect(target('postal').rows[2][2]).toBe('https://example.invalid/app');
    const b = await add(entry('TEST/P2', 1)); expect(b.register).toMatchObject({ blockNumber: 2 });
    const before = JSON.stringify(files); const retry = await add(); expect(retry.register?.action).toBe('skip'); expect(retry.cash.action).toBe('skip'); expect(JSON.stringify(files)).toBe(before); expect(count('postal')).toBe(2); expect(count('cash')).toBe(2);
    expect(JSON.stringify(files.cash[0])).toBe(JSON.stringify(JSON.parse(prior).cash[0])); expect(JSON.stringify(files.postal[0])).toBe(JSON.stringify(JSON.parse(prior).postal[0]));
});
it('serializes concurrent first calls including a duplicate', async () => { const results = await Promise.all([add(), add(entry('TEST/P2')), add()]); expect(results.map(r => r.register?.action)).toEqual(['write', 'write', 'skip']); expect(count('postal')).toBe(2); expect(count('cash')).toBe(2); });
it('cash preflight failure writes no business entries', async () => { files.cash[0].rows[34][0] = 'invalid'; await expect(add()).rejects.toThrow(); expect(count('postal')).toBe(0); expect(count('cash')).toBe(0); });
it('recovers an empty owned structure after lost provisioning response', async () => { failure = 'postal:structure'; await expect(add()).rejects.toThrow(); expect(count('postal')).toBe(0); expect((await add()).register).toMatchObject({ blockNumber: 1 }); });
it.each(['postal:before', 'cash:before', 'postal:after', 'cash:after'])('reports exact state after %s then retries without duplicates', async phase => {
    failure = phase;
    if (phase === 'cash:after') { const result = await add(); expect(result.cash.action).toBe('write'); expect(result.cash).toMatchObject({ targetRow: 3 }); }
    else await expect(add()).rejects.toMatchObject({ outcome: { register: phase === 'postal:before' ? 'absent' : 'complete', cash: 'absent' } });
    await add(); expect(count('postal')).toBe(1); expect(count('cash')).toBe(1);
});
it('unknown transport state never claims absence', async () => { failure = 'postal:unknown'; await expect(add()).rejects.toMatchObject({ outcome: { register: 'unknown', cash: 'unknown' } }); readsFail = false; await add(); expect(count('postal')).toBe(1); expect(count('cash')).toBe(1); });
it('cash-only manual row is preserved while missing postal block is completed', async () => { await Cash.write({} as any, entry(), { spreadsheetId: 'cash' }); target('cash').rows[2][13] = ''; const before = JSON.stringify(target('cash')); const result = await add(); expect(result.cash.action).toBe('skip'); expect(result.register?.action).toBe('write'); expect(JSON.stringify(target('cash'))).toBe(before); });
it.each(['date', 'amount', 'tracking', 'addressee', 'sum', 'marker', 'duplicate'])('same invoice with changed postal %s blocks before cash mutation', async field => { await add(); const tab = target('postal'); if (field === 'date') tab.rows[5][5] = '1'; if (field === 'amount') tab.rows[5][6] = '12'; if (field === 'tracking') tab.rows[5][4] = 'bad'; if (field === 'addressee') tab.rows[5][2] = 'OTHER'; if (field === 'sum') tab.rows[7][6] = '=SUM(G6)'; if (field === 'marker') tab.rows[4][8] = 'auto:OTHER'; if (field === 'duplicate') tab.rows.push([...tab.rows[4]]); const before = JSON.stringify(files); await expect(add()).rejects.toThrow(); expect(JSON.stringify(files)).toBe(before); });
it('same cash document with changed contents blocks missing postal write', async () => { await Cash.write({} as any, entry(), { spreadsheetId: 'cash' }); target('cash').rows[2][4] = '99'; await expect(add()).rejects.toMatchObject({ outcome: { register: 'absent', cash: 'conflict' } }); expect(count('postal')).toBe(0); });
it.each(['blank', 'duplicate title', 'incomplete', 'duplicate number'])('rejects %s existing annual tab', async kind => { files.postal.push({ id: 21, title: 'poczta wych. 2027', rows: kind === 'blank' ? [] : postalRows() }); if (kind === 'duplicate title') files.postal.push({ id: 22, title: 'Poczta wych. 2027 ', rows: [] }); if (kind === 'incomplete') target('postal').rows[7][6] = ''; if (kind === 'duplicate number') target('postal').rows.push([], ...Postal.buildBlockRows(entry('OTHER'), 1, 10, { tracking: 'nr listu', date: 'data', amount: 'kwota' }).map(rowCells)); const before = JSON.stringify(files); await expect(add()).rejects.toThrow(); expect(JSON.stringify(files)).toBe(before); });
