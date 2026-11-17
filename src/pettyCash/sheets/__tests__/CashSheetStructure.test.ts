import ToolsSheets from '../../../tools/ToolsSheets';
import PettyCashWriter from '../PettyCashWriter';
import CashSheetStructure from '../CashSheetStructure';
import PettyCashEntry from '../../PettyCashEntry';
jest.mock('../../../tools/ToolsSheets');

const entry=(date='2027-01-03',doc='TEST/1') => new PettyCashEntry({
    entryKind: 'INVOICE',entryDate: date,description: 'synthetic',netAmount: 10,
    grossAmount: 12,documentNumber: doc,payerLabel: 'TEST',settlementMethod: 'CASH',
});
const header=(year: number) => [String(year),'ZALICZKA, zapałata kartą (wpływ)','OPIS','NETTO','BRUTTO','BEZ FV / PARAGON','wydatek','saldo / Nr faktury '];
function yearRows(year=2026,months=12): string[][] {
    const rows: string[][]=[header(year)];
    for(let m=1;m<=months;m++) {
        const r=rows.length+1;
        const row=Array(14).fill('');
        row[0]=String(PettyCashWriter.dateToSerial(`${year}-${String(m).padStart(2,'0')}-01`));
        for(const col of ['B','D','E','F','G']) row[col.charCodeAt(0)-65]=`=SUM(${col}${r+1}:${col}${r+2})`;
        row[7]=`=B${r}-G${r}+${m===1? `'zaliczki ${year-1}'!H2`:`H${r-3}`}`;
        row[8]='POZOSTAŁO W PORTFELU';
        rows.push(row,[],[]);
    }
    return rows;
}

type Tab={ id: number; title: string; rows: string[][] };
let tabs: Tab[],batches: any[][],balance: any,failAfterCommit: boolean;
function apply(requests: any[]) {
    for(const request of requests) {
        if(request.addSheet) {
            const p=request.addSheet.properties;
            tabs.push({ id: p.sheetId,title: p.title,rows: [] });
        }
        if(request.updateCells) {
            const { start,rows }=request.updateCells;
            const tab=tabs.find(t => t.id===start.sheetId)!;
            rows.forEach((row: any,offset: number) => {
                tab.rows[start.rowIndex+offset]=row.values.map((cell: any) => {
                    const v=cell.userEnteredValue??{};
                    return String(v.formulaValue??v.numberValue??v.stringValue??'');
                });
            });
        }
    }
}
beforeEach(() => {
    jest.resetAllMocks();
    tabs=[{ id: 10,title: 'zaliczki 2026',rows: yearRows() }]; batches=[]; balance=500; failAfterCommit=false;
    (ToolsSheets.getSpreadSheet as jest.Mock).mockImplementation(async () => ({ data: { sheets: [...tabs,{ id: 9,title: 'zaliczki 2025' }].map(t => ({ properties: { sheetId: t.id,title: t.title,gridProperties: { rowCount: 1000 } } })) } }));
    (ToolsSheets.getValues as jest.Mock).mockImplementation(async (_auth,p) => {
        const title=p.rangeA1.match(/^'((?:''|[^'])+)'!/)[1].replace(/''/g,"'");
        if(p.valueRenderOption==='UNFORMATTED_VALUE') return { values: [[balance]] };
        if(title==='zaliczki 2025') {
            const rows=yearRows(2025,1); rows[1][0]=String(PettyCashWriter.dateToSerial('2025-12-01'));
            return { values: rows };
        }
        return { values: tabs.find(t => t.title===title)!.rows };
    });
    (ToolsSheets.batchUpdateSheet as jest.Mock).mockImplementation(async (_auth,requests) => {
        batches.push(requests); apply(requests);
        if(failAfterCommit) { failAfterCommit=false; throw new Error('lost response'); }
    });
});
const write=(date?: string,doc?: string) => PettyCashWriter.write({} as any,entry(date,doc),{ spreadsheetId: 'synthetic' });

describe('cash annual and monthly preparation',() => {
    it('opens January, carries a formula from December, writes only one real row, and retries idempotently',async () => {
        expect((await write()).action).toBe('write');
        const target=tabs[1];
        expect(target.rows[1][7]).toBe("=B2-G2+'zaliczki 2026'!H35");
        expect(target.rows.filter(r => r?.[13])).toHaveLength(1);
        expect((await write()).action).toBe('skip');
        expect(tabs).toHaveLength(2);
    });
    it('opens an uninterrupted chain through April and later June without changing prior/manual rows',async () => {
        await write('2027-04-03');
        const target=tabs[1]; const before=JSON.stringify(target.rows);
        await write('2027-06-03','TEST/2');
        expect(PettyCashWriter.parseMonthBlocks(target.rows).map(b => b.monthKey)).toEqual(['2027-01','2027-02','2027-03','2027-04','2027-05','2027-06']);
        expect(JSON.stringify(target.rows.slice(0,JSON.parse(before).length))).toBe(before);
    });
    it('serializes distinct concurrent first entries and duplicate requests through the business write',async () => {
        const results=await Promise.all([write(undefined,'TEST/A'),write(undefined,'TEST/B'),write(undefined,'TEST/A')]);
        expect(results.map(r => r.action)).toEqual(['write','write','skip']);
        expect(tabs).toHaveLength(2);
        expect(tabs[1].rows[2][7]).toBe('TEST/A');
        expect(tabs[1].rows[3][7]).toBe('TEST/B');
    });
    it('recovers an atomic structure committed before transport failure without recreating it',async () => {
        failAfterCommit=true;
        await expect(write()).rejects.toThrow('lost response');
        expect(tabs).toHaveLength(2);
        expect((await write()).action).toBe('write');
        expect(tabs).toHaveLength(2);
    });
    it('blocks absent December without any mutation',async () => {
        tabs[0].rows=yearRows(2026,11);
        await expect(write()).rejects.toThrow('grudnia');
        expect(batches).toHaveLength(0);
    });
    it.each(['#REF!','','500',NaN])('blocks nonnumeric close %p before mutation',async value => {
        balance=value;
        await expect(write()).rejects.toThrow('Saldo');
        expect(batches).toHaveLength(0);
    });
    it('blocks duplicate December and wrong SUM ranges',async () => {
        tabs[0].rows[34][0]=tabs[0].rows[31][0];
        await expect(write()).rejects.toThrow('Powielony');
        expect(batches).toHaveLength(0);
    });
    it('blocks a damaged existing structure without changing manual data',async () => {
        tabs.push({ id: 11,title: 'zaliczki 2027',rows: yearRows(2027,1) });
        tabs[1].rows[1][6]='=SUM(G3:G100)';
        const before=JSON.stringify(tabs);
        await expect(write()).rejects.toThrow('Nieprawidłowa suma G');
        expect(JSON.stringify(tabs)).toBe(before);
        expect(batches).toHaveLength(0);
    });
    it('blocks case/space duplicate year tabs',async () => {
        tabs.push({ id: 11,title: 'zaliczki 2027',rows: yearRows(2027,1) },{ id: 12,title: 'ZALICZKI 2027 ',rows: yearRows(2027,1) });
        await expect(write()).rejects.toThrow('Niejednoznaczne');
        expect(batches).toHaveLength(0);
    });
    it('writes historical entries to their dated year and preserves manual occupied row',async () => {
        tabs[0].rows[2]=Array(14).fill(''); tabs[0].rows[2][2]='manual';
        expect((await write('2026-01-05')).action).toBe('write');
        expect(tabs).toHaveLength(1);
        expect(tabs[0].rows[2][2]).toBe('manual');
        expect(tabs[0].rows[3][7]).toBe('TEST/1');
    });
    it('revalidates mutated structure before writing any entry',async () => {
        (ToolsSheets.batchUpdateSheet as jest.Mock).mockImplementation(async (_a,requests) => {
            batches.push(requests); apply(requests);
            if(requests.some((r: any) => r.addSheet)) tabs[1].rows[1][6]='#REF!';
        });
        await expect(write()).rejects.toThrow('Nieprawidłowa suma G');
        expect(batches).toHaveLength(1);
    });
});

describe('manual and previous-year safeguards',() => {
    it('refuses an existing January linked to November rather than December',async () => {
        const rows=yearRows(2027,1); rows[1][7]="=B2-G2+'zaliczki 2026'!H32";
        tabs.push({ id: 11,title: 'zaliczki 2027',rows });
        await expect(write()).rejects.toThrow('nie wskazuje grudnia');
        expect(batches).toHaveLength(0);
    });
    it('accepts a manually prepared one-row block and preserves I/J header',async () => {
        const rows=yearRows(2027,1); rows[1][7]="=B2-G2+'zaliczki 2026'!H35";
        for(const col of ['B','D','E','F','G']) rows[1][col.charCodeAt(0)-65]=`=SUM(${col}3:${col}3)`;
        rows[0][8]='kto zapłacił'; rows[0][9]='uwaga';
        tabs.push({ id: 11,title: 'zaliczki 2027',rows });
        expect((await write()).action).toBe('write');
        expect(rows[0][8]).toBe('kto zapłacił');
    });
    it('carries only the complete working header, never notes from extra columns',async () => {
        tabs[0].rows[0][8]='kto zapłacił'; tabs[0].rows[0][9]='uwaga';
        tabs[0].rows[0][11]='private note outside header';
        await write();
        expect(tabs[1].rows[0].slice(8,10)).toEqual(['kto zapłacił','uwaga']);
        expect(tabs[1].rows[0][11]??'').toBe('');
    });
});

describe('canonical Google normalization and source overlap',() => {
    it('accepts Google single-cell SUM normalization',async () => {
        const rows=yearRows(2027,1); rows[1][7]="=B2-G2+'zaliczki 2026'!H35";
        for(const col of ['B','D','E','F','G']) rows[1][col.charCodeAt(0)-65]=`=SUM(${col}3)`;
        tabs.push({ id: 11,title: 'zaliczki 2027',rows });
        expect((await write()).action).toBe('write');
    });
    it('rejects prior December inside another monthly SUM even when target year exists',async () => {
        const rows=yearRows(2027,1); rows[1][7]="=B2-G2+'zaliczki 2026'!H35";
        tabs.push({ id: 11,title: 'zaliczki 2027',rows });
        tabs[0].rows[31][1]='=SUM(B33:B36)';
        await expect(write()).rejects.toThrow('nakładające');
        expect(batches).toHaveLength(0);
    });
});
