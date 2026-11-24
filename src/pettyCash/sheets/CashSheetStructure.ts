import { randomInt } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import ToolsSheets from '../../tools/ToolsSheets';
import AnnualSheetStructureError from './AnnualSheetStructureError';
import PettyCashWriter,{ MonthBlock,SheetSnapshot } from './PettyCashWriter';

const WIDTH=14;
const DATA_ROWS=30;
const SUM_COLUMNS=['B','D','E','F','G'];
const quoted=(title: string) => `'${title.replace(/'/g,"''")}'`;
const compact=(formula: string) => formula.replace(/\s/g,'').toUpperCase();
const sumMatches=(formula: string,col: string,first: number,last: number) =>
    compact(formula)===`=SUM(${col}${first}:${col}${last})`||
    (first===last&&compact(formula)===`=SUM(${col}${first})`);

/** Only the cash layout audited in the original register is accepted. No data repair. */
export default class CashSheetStructure {
    static fail(year: number,detail: string): never {
        throw new AnnualSheetStructureError('ANNUAL_SHEET_INCOMPLETE','cash',year,
            `Nie można przygotować zaliczek na ${year}: ${detail} Sprawdź arkusz lub skontaktuj się z administratorem.`);
    }

    static validate(snapshot: SheetSnapshot,year: number): MonthBlock[] {
        const rows=snapshot.rows;
        const expected=['OPIS','NETTO','BRUTTO','BEZ FV / PARAGON','wydatek','saldo / Nr faktury'];
        if(rows[0]?.[0]!==String(year)||expected.some((value,i) =>
            (rows[0]?.[i+2]??'').trim().toLowerCase()!==value.toLowerCase()))
            this.fail(year,'Nieprawidłowy nagłówek zakładki.');
        const blocks=PettyCashWriter.parseMonthBlocks(rows);
        const seen=new Set<string>();
        for(const block of blocks) {
            if(!block.monthKey.startsWith(`${year}-`)||seen.has(block.monthKey)||
                block.firstDataRow!==block.aggregateRow+1||block.lastDataRow<block.firstDataRow)
                this.fail(year,'Powielony lub nieprawidłowy blok miesiąca.');
            seen.add(block.monthKey);
            for(const col of SUM_COLUMNS) {
                const index=col.charCodeAt(0)-65;
                if(!sumMatches(rows[block.aggregateRow-1]?.[index]??'',col,block.firstDataRow,block.lastDataRow))
                    this.fail(year,`Nieprawidłowa suma ${col} miesiąca ${block.monthKey}.`);
            }
            if(blocks.some(other => other!==block&&other.aggregateRow>=block.firstDataRow&&
                other.aggregateRow<=block.lastDataRow))
                this.fail(year,'Zakresy miesięcy nakładają się.');
            const previous=blocks.find(b => b.monthKey===
                `${year}-${String(Number(block.monthKey.slice(5))-1).padStart(2,'0')}`);
            const balance=compact(rows[block.aggregateRow-1]?.[7]??'');
            const base=`=B${block.aggregateRow}-G${block.aggregateRow}+`;
            if(block.monthKey.endsWith('-01')) {
                if(!new RegExp(`^${base.replace(/\+/g,'\\+')}('?[^!']*${year-1}[^!']*'?)!\\$?H\\$?[1-9]\\d*$`).test(balance))
                    this.fail(year,'Styczeń nie wskazuje salda poprzedniego roku.');
            } else if(!previous||balance!==`${base}H${previous.aggregateRow}`)
                this.fail(year,`Brak poprawnego salda poprzedniego miesiąca dla ${block.monthKey}.`);
        }
        // A month label whose SUM is damaged must not be mistaken for an absent month.
        for(let r=1;r<rows.length;r++) {
            if((rows[r]?.[8]??'').toUpperCase().includes('POZOSTAŁO')&&
                !blocks.some(b => b.aggregateRow===r+1))
                this.fail(year,'Niekompletny wiersz zbiorczy miesiąca.');
        }
        if(!blocks.length) this.fail(year,'Zakładka istnieje, ale nie ma poprawnych bloków miesięcy.');
        return blocks;
    }

    static blockRequests(sheetId: number,monthKey: string,row: number,previous: string,
        sourceSheetId: number,sourceRow: number): any[] {
        const first=row+1,last=row+DATA_ROWS;
        const values: any[]=Array.from({ length: WIDTH },() => ({}));
        values[0]={ userEnteredValue: { numberValue: PettyCashWriter.dateToSerial(`${monthKey}-01`) } };
        for(const col of SUM_COLUMNS)
            values[col.charCodeAt(0)-65]={ userEnteredValue: { formulaValue: `=SUM(${col}${first}:${col}${last})` } };
        values[7]={ userEnteredValue: { formulaValue: `=B${row}-G${row}+${previous}` } };
        values[8]={ userEnteredValue: { stringValue: 'POZOSTAŁO W PORTFELU' } };
        const range=(id: number,start: number,end: number) => ({
            sheetId: id,
            startRowIndex: start-1,endRowIndex: end,startColumnIndex: 0,endColumnIndex: WIDTH
        });
        return [
            {
                copyPaste: {
                    source: range(sourceSheetId,sourceRow,sourceRow),
                    destination: range(sheetId,row,row),pasteType: 'PASTE_FORMAT'
                }
            },
            {
                copyPaste: {
                    source: range(sourceSheetId,sourceRow+1,sourceRow+1),
                    destination: range(sheetId,first,last),pasteType: 'PASTE_FORMAT'
                }
            },
            { updateCells: { start: { sheetId,rowIndex: row-1,columnIndex: 0 },rows: [{ values }],fields: 'userEnteredValue' } },
            PettyCashWriter.buildDateFormatRequest(sheetId,row,row,'mmm yyyy'),
            PettyCashWriter.buildDateFormatRequest(sheetId,first,last),
        ];
    }

    static async ensure(auth: OAuth2Client,spreadsheetId: string,year: number,month: number): Promise<SheetSnapshot> {
        const meta=(await ToolsSheets.getSpreadSheet(auth,spreadsheetId)).data;
        const sheets=meta.sheets??[];
        const candidates=sheets.filter(s => (s.properties?.title??'').includes(String(year)));
        let snapshot: SheetSnapshot;
        if(candidates.length) {
            if(candidates.length!==1) this.fail(year,'Niejednoznaczne zakładki roku.');
            snapshot=await PettyCashWriter.loadSnapshot(auth,spreadsheetId,year);
        } else {
            let source: SheetSnapshot;
            try { source=await PettyCashWriter.loadSnapshot(auth,spreadsheetId,year-1); }
            catch(error) {
                if(error instanceof AnnualSheetStructureError)
                    throw new AnnualSheetStructureError(error.code,'cash',year,`Nie można otworzyć roku ${year}: brak jednoznacznej zakładki ${year-1} z saldem grudnia.`);
                throw error;
            }
            const blocks=this.validate(source,year-1);
            const december=blocks.filter(b => b.monthKey===`${year-1}-12`);
            if(december.length!==1) this.fail(year,`Brak jednoznacznego salda grudnia ${year-1}. Zamknij grudzień przed pierwszym wpisem.`);
            const close=december[0];
            await this.assertNumericBalance(auth,spreadsheetId,source,close,year);
            const sheetId=randomInt(1,2147483647),title=`zaliczki ${year}`;
            const header=source.rows[0].slice(0,10).map((value,i) => ({ userEnteredValue: i===0? { numberValue: year }:{ stringValue: value } }));
            const requests: any[]=[
                { addSheet: { properties: { sheetId,title,gridProperties: { rowCount: 1000,columnCount: WIDTH,frozenRowCount: 1 } } } },
                {
                    copyPaste: {
                        source: { sheetId: source.tab.sheetId,startRowIndex: 0,endRowIndex: 1,startColumnIndex: 0,endColumnIndex: WIDTH },
                        destination: { sheetId,startRowIndex: 0,endRowIndex: 1,startColumnIndex: 0,endColumnIndex: WIDTH },pasteType: 'PASTE_FORMAT'
                    }
                },
                { updateCells: { start: { sheetId,rowIndex: 0,columnIndex: 0 },rows: [{ values: header }],fields: 'userEnteredValue' } },
                PettyCashWriter.buildHideMarkerColumn(sheetId),
            ];
            for(let m=1;m<=month;m++) {
                const row=2+(m-1)*(DATA_ROWS+1);
                requests.push(...this.blockRequests(sheetId,`${year}-${String(m).padStart(2,'0')}`,row,
                    m===1? `${quoted(source.tab.title)}!H${close.aggregateRow}`:`H${row-DATA_ROWS-1}`,
                    source.tab.sheetId,close.aggregateRow));
            }
            // The entire empty structure is atomic. A transport failure may have committed;
            // propagate it, then a caller retry rereads and validates the resulting tab.
            await ToolsSheets.batchUpdateSheet(auth,requests,spreadsheetId);
            snapshot=await PettyCashWriter.loadSnapshot(auth,spreadsheetId,year);
        }
        let blocks=this.validate(snapshot,year);
        await this.validateJanuaryClose(auth,spreadsheetId,snapshot,blocks,year);
        let lastMonth=Math.max(...blocks.map(b => Number(b.monthKey.slice(5))));
        if(!blocks.some(b => b.monthKey===`${year}-${String(month).padStart(2,'0')}`)&&month<=lastMonth)
            this.fail(year,'Brak wcześniejszego miesiąca w istniejącym układzie. Nie zmieniono ręcznych wierszy.');
        if(month>lastMonth) {
            const previous=blocks.find(b => Number(b.monthKey.slice(5))===lastMonth)!;
            await this.assertNumericBalance(auth,spreadsheetId,snapshot,previous,year);
            let row=Math.max(snapshot.rows.length,...blocks.map(b => b.lastDataRow))+1;
            let prior=`H${previous.aggregateRow}`;
            const requests: any[]=[];
            const gridRows=sheets.find(s => s.properties?.sheetId===snapshot.tab.sheetId)?.properties?.gridProperties?.rowCount??1000;
            const neededRows=row+(month-lastMonth)*(DATA_ROWS+1)-1;
            if(neededRows>gridRows) requests.push({ appendDimension: { sheetId: snapshot.tab.sheetId,dimension: 'ROWS',length: neededRows-gridRows } });
            while(lastMonth<month) {
                lastMonth++;
                requests.push(...this.blockRequests(snapshot.tab.sheetId,`${year}-${String(lastMonth).padStart(2,'0')}`,row,
                    prior,snapshot.tab.sheetId,previous.aggregateRow));
                prior=`H${row}`;
                row+=DATA_ROWS+1;
            }
            await ToolsSheets.batchUpdateSheet(auth,requests,spreadsheetId);
            snapshot=await PettyCashWriter.loadSnapshot(auth,spreadsheetId,year);
            blocks=this.validate(snapshot,year);
        }
        const target=blocks.find(b => b.monthKey===`${year}-${String(month).padStart(2,'0')}`);
        if(!target) this.fail(year,'Nie udało się potwierdzić struktury miesiąca po przygotowaniu.');
        await this.assertNumericBalance(auth,spreadsheetId,snapshot,target,year);
        return snapshot;
    }

    private static async validateJanuaryClose(auth: OAuth2Client,spreadsheetId: string,
        snapshot: SheetSnapshot,blocks: MonthBlock[],year: number): Promise<void> {
        const january=blocks.find(b => b.monthKey===`${year}-01`);
        if(!january) this.fail(year,'Brak stycznia i otwarcia roku.');
        const source=await PettyCashWriter.loadSnapshot(auth,spreadsheetId,year-1);
        const december=PettyCashWriter.parseMonthBlocks(source.rows).filter(b => b.monthKey===`${year-1}-12`);
        if(december.length!==1) this.fail(year,`Brak jednoznacznego salda grudnia ${year-1}.`);
        const close=december[0];
        if(PettyCashWriter.parseMonthBlocks(source.rows).some(other => other!==close&&
            other.aggregateRow!==close.aggregateRow&&
            ((other.aggregateRow>=close.firstDataRow&&other.aggregateRow<=close.lastDataRow)||
                (close.aggregateRow>=other.firstDataRow&&close.aggregateRow<=other.lastDataRow))))
            this.fail(year,'Grudzień poprzedniego roku ma nakładające się zakresy.');
        if(close.firstDataRow!==close.aggregateRow+1||close.lastDataRow<close.firstDataRow)
            this.fail(year,'Nieprawidłowy zakres grudnia poprzedniego roku.');
        for(const col of SUM_COLUMNS) {
            if(!sumMatches(source.rows[close.aggregateRow-1]?.[col.charCodeAt(0)-65]??'',col,close.firstDataRow,close.lastDataRow))
                this.fail(year,'Nieprawidłowe sumy grudnia poprzedniego roku.');
        }
        const expected=`=B${january.aggregateRow}-G${january.aggregateRow}+${quoted(source.tab.title)}!H${close.aggregateRow}`;
        const actual=(snapshot.rows[january.aggregateRow-1]?.[7]??'').replace(/\$/g,'');
        if(compact(actual)!==compact(expected)&&compact(actual)!==compact(expected.replace(quoted(source.tab.title),source.tab.title)))
            this.fail(year,'Saldo stycznia nie wskazuje grudnia poprzedniego roku.');
        await this.assertNumericBalance(auth,spreadsheetId,source,close,year);
    }
    private static async assertNumericBalance(auth: OAuth2Client,spreadsheetId: string,
        snapshot: SheetSnapshot,block: MonthBlock,year: number): Promise<void> {
        const values=await ToolsSheets.getValues(auth,{
            spreadsheetId,
            rangeA1: `${quoted(snapshot.tab.title)}!H${block.aggregateRow}`,valueRenderOption: 'UNFORMATTED_VALUE'
        });
        const value=values.values?.[0]?.[0];
        if(typeof value!=='number'||!Number.isFinite(value))
            this.fail(year,`Saldo ${block.monthKey} jest puste lub błędne.`);
    }
}
