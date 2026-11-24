import { randomInt } from 'crypto';
import AnnualSheetStructureError from './AnnualSheetStructureError';
import { OAuth2Client } from 'google-auth-library';
import ToolsSheets from '../../tools/ToolsSheets';
import PettyCashEntry from '../PettyCashEntry';
import PostalDispatchItem from '../postal/PostalDispatchItem';
import {
    POSTAL_COL,
    POSTAL_VISIBLE_WIDTH,
    POSTAL_WIDTH,
    SUM_ROW_PATTERN,
} from './postalRegisterConfig';
import { dateToSerial } from './sheetDates';

export type RegisterTabRef = { title: string; sheetId: number };

export type RegisterBlock = {
    blockNumber: number;
    headerRow: number;
    firstItemRow: number;
    lastItemRow: number;
    sumRow: number;
};

export type RegisterSnapshot = { tab: RegisterTabRef; rows: string[][] };

export type RegisterPlan =
    | {
          action: 'write';
          blockNumber: number;
          headerRow: number;
          firstItemRow: number;
          sumRow: number;
          requests: any[];
      }
    | { action: 'skip'; reason: string; existingRow: number }
    | { action: 'blocked'; reason: string; code?: 'ANNUAL_SHEET_INCOMPLETE' };

/**
 * Dopisuje blok wysylki do rejestru listow.
 *
 * Zasady wyprowadzone z odczytu zywej zakladki:
 *  - nowy blok idzie dwa wiersze pod wierszem sumy ostatniego bloku (jeden wiersz to separator),
 *  - numer bloku bierzemy z arkusza (`max` kolumny A + 1), bo numeracja restartuje sie co roku,
 *  - blok WSTAWIA sobie wiersze, zamiast wpisywac sie w istniejace puste. Pod ostatnim blokiem
 *    bylo ich tylko 21, a nizej stoi ksiazka adresowa e-maili; wstawianie przesuwa ja w dol,
 *    wiec miejsce nigdy sie nie konczy i nic cudzego nie zostaje nadpisane,
 *  - `values.append` jest zakazany: celuje w pierwszy wiersz po ostatniej niepustej komorce
 *    calej zakladki, czyli w srodek tamtej ksiazki adresowej,
 *  - wstawione wiersze nie maja formatowania, wiec kopiujemy je z poprzedniego bloku,
 *  - etykiety kolumn w naglowku przepisujemy z poprzedniego bloku zamiast zaszywac w kodzie -
 *    w arkuszu maja spacje na koncu i lepiej, zeby nowy blok byl ich wierna kopia.
 */
export default class PostalRegisterWriter {
    // ---------------------------------------------------------------- odczyt

    static matchTabTitle(titles: string[], year: number): string | null {
        const wanted = String(year);
        const normalized = titles.map((title) => ({
            title,
            key: title.trim().toLowerCase().replace(/\s+/g, ' '),
        }));
        const exact = normalized.filter((t) => t.key === `poczta wych. ${wanted}`);
        if (exact.length > 1) return null;
        if (exact.length === 1) return exact[0].title;
        const containing = normalized.filter(
            (t) => t.key.includes('poczta') && t.key.includes(wanted)
        );
        return containing.length === 1 ? containing[0].title : null;
    }

    static async loadSnapshot(
        auth: OAuth2Client,
        spreadsheetId: string,
        year: number
    ): Promise<RegisterSnapshot> {
        const meta = await ToolsSheets.getSpreadSheet(auth, spreadsheetId);
        const sheets = meta.data.sheets ?? [];
        const titles = sheets.map((s) => s.properties?.title ?? '');
        const title = this.matchTabTitle(titles, year);
        if (!title)
            throw new AnnualSheetStructureError(
                'ANNUAL_SHEET_MISSING',
                'postal',
                year,
                `Nie znaleziono jednoznacznej zakładki poczty dla roku ${year}. Sprawdź zakładkę tego roku w arkuszu lub skontaktuj się z administratorem.`
            );
        const sheetId =
            sheets.find((s) => s.properties?.title === title)?.properties?.sheetId ?? 0;

        const data = await ToolsSheets.getValues(auth, {
            spreadsheetId,
            rangeA1: `'${title.replace(/'/g, "''")}'!A:I`,
            valueRenderOption: 'FORMULA',
        });

        return {
            tab: { title, sheetId },
            rows: ((data.values ?? []) as any[][]).map((row) =>
                Array.from({ length: POSTAL_WIDTH }, (_, i) =>
                    row[i] === undefined || row[i] === null ? '' : String(row[i])
                )
            ),
        };
    }

    // ------------------------------------------------------- analiza migawki

    static cell(rows: string[][], row1Based: number, col: number): string {
        return this.rawCell(rows, row1Based, col).trim();
    }

    /** Bez przycinania - potrzebne tam, gdzie kopiujemy tresc znak w znak. */
    static rawCell(rows: string[][], row1Based: number, col: number): string {
        return rows[row1Based - 1]?.[col] ?? '';
    }

    /**
     * Ostatni blok w zakladce. Kolumna A jest scalona pionowo przez caly blok, wiec
     * wartosc numeru wraca tylko w wierszu naglowkowym - to czyni ja pewnym wskaznikiem.
     */
    static findLastBlock(rows: string[][]): RegisterBlock | null {
        let best: { blockNumber: number; headerRow: number } | null = null;

        for (let row = 1; row <= rows.length; row++) {
            const raw = this.cell(rows, row, POSTAL_COL.blockNumber);
            if (!/^\d+$/.test(raw)) continue;
            const blockNumber = Number(raw);
            if (!best || blockNumber > best.blockNumber) best = { blockNumber, headerRow: row };
        }
        if (!best) return null;

        const sumRow = this.findSumRow(rows, best.headerRow);
        if (sumRow === null) return null;

        return {
            blockNumber: best.blockNumber,
            headerRow: best.headerRow,
            firstItemRow: best.headerRow + 1,
            lastItemRow: sumRow - 1,
            sumRow,
        };
    }

    private static findSumRow(rows: string[][], headerRow: number): number | null {
        for (let row = headerRow + 1; row <= rows.length; row++) {
            if (SUM_ROW_PATTERN.test(this.cell(rows, row, POSTAL_COL.amount))) return row;
            // Kolejny naglowek oznacza, ze blok nie ma wiersza sumy - nie zgadujemy.
            if (/^\d+$/.test(this.cell(rows, row, POSTAL_COL.blockNumber))) return null;
        }
        return null;
    }

    static findExistingBlock(
        rows: string[][],
        invoiceNumber: string
    ): { row: number; reason: string } | null {
        const wanted = invoiceNumber.trim().toLowerCase();
        if (!wanted) return null;
        for (let row = 1; row <= rows.length; row++)
            if (this.cell(rows, row, POSTAL_COL.itemIndex).toLowerCase() === wanted)
                return {
                    row,
                    reason: `Faktura ${invoiceNumber} ma juz blok w rejestrze, w wierszu ${row}.`,
                };
        return null;
    }

    /**
     * Numer nadania odczytany z komorki.
     *
     * Od czasu dodania linku do sledzenia komorka moze byc formula
     * `=HYPERLINK("adres";"(00)5590...")`. Czytamy wtedy tekst wyswietlany, a nie cala
     * formule - inaczej normalizacja wycialaby cyfry z adresu URL i zlepiala je z numerem.
     */
    static readTrackingCell(rows: string[][], row: number): string {
        const raw = this.cell(rows, row, POSTAL_COL.tracking);
        const hyperlink = raw.match(/^=HYPERLINK\(.*[;,]\s*"(.*)"\s*\)$/i);
        return hyperlink ? hyperlink[1] : raw;
    }

    /**
     * Etykiety kolumn przepisane z naglowka poprzedniego bloku, znak w znak.
     * W zywym arkuszu maja spacje na koncu ('data ', 'kwota ') - przycinanie ich
     * zrobiloby z nowego bloku wersje "poprawiona", a chcemy wierna kopie.
     */
    static readHeaderLabels(rows: string[][], headerRow: number) {
        return {
            tracking: this.rawCell(rows, headerRow, POSTAL_COL.tracking),
            date: this.rawCell(rows, headerRow, POSTAL_COL.date),
            amount: this.rawCell(rows, headerRow, POSTAL_COL.amount),
        };
    }

    // ------------------------------------------------------------ budowa zadan

    private static text(value: string) {
        return { userEnteredValue: { stringValue: value } };
    }
    private static number(value: number) {
        return { userEnteredValue: { numberValue: value } };
    }
    private static formula(value: string) {
        return { userEnteredValue: { formulaValue: value } };
    }
    private static blankRow(): any[] {
        return Array.from({ length: POSTAL_WIDTH }, () => ({}));
    }

    /**
     * Blok jednopozycyjny dostaje `=SUM(G429)`, wielopozycyjny `=SUM(G6:G9)` -
     * dokladnie tak, jak zapisuja to ludzie w tym arkuszu.
     */
    static buildSumFormula(firstItemRow: number, lastItemRow: number): string {
        return firstItemRow === lastItemRow
            ? `=SUM(G${firstItemRow})`
            : `=SUM(G${firstItemRow}:G${lastItemRow})`;
    }

    /**
     * Komorka z numerem nadania. Gdy szablon linku jest ustawiony, numer staje sie
     * odnosnikiem do sledzenia przesylki, ale WYSWIETLA sie tak samo jak dotad -
     * `(00)` + 18 cyfr - zeby blok nie roznil sie wygladem od wpisanych recznie.
     *
     * Separator argumentow to srednik, bo arkusz jest w polskiej lokalizacji (przecinek
     * jest tam separatorem dziesietnym). Sprawdzone zapisem na kopii.
     */
    private static trackingCell(trackingNumber: string, trackingUrlTemplate: string) {
        const display = PostalDispatchItem.formatTrackingNumberForSheet(trackingNumber);
        const url = PostalDispatchItem.buildTrackingUrl(
            trackingUrlTemplate,
            trackingNumber
        );
        return url
            ? this.formula(`=HYPERLINK("${url}";"${display}")`)
            : this.text(display);
    }

    static buildBlockRows(
        entry: PettyCashEntry,
        blockNumber: number,
        headerRow: number,
        labels: { tracking: string; date: string; amount: string },
        trackingUrlTemplate = ''
    ): any[][] {
        const dispatch = entry._dispatch!;
        const firstItemRow = headerRow + 1;
        const lastItemRow = headerRow + dispatch.items.length;

        const header = this.blankRow();
        header[POSTAL_COL.blockNumber] = this.number(blockNumber);
        header[POSTAL_COL.itemIndex] = this.text(dispatch.invoiceNumber);
        header[POSTAL_COL.tracking] = this.text(labels.tracking);
        header[POSTAL_COL.date] = this.text(labels.date);
        header[POSTAL_COL.amount] = this.text(labels.amount);
        header[POSTAL_COL.marker] = this.text(dispatch.sheetMarker());

        const items = dispatch.items.map((item, index) => {
            const row = this.blankRow();
            row[POSTAL_COL.itemIndex] = this.number(index + 1);
            row[POSTAL_COL.addressee] = this.text(item.addressee);
            if (item.contentsDescription)
                row[POSTAL_COL.contents] = this.text(item.contentsDescription);
            row[POSTAL_COL.tracking] = this.trackingCell(
                item.trackingNumber,
                trackingUrlTemplate
            );
            // Data tylko w pierwszym wierszu - pozostale kryje scalenie kolumny F.
            if (index === 0)
                row[POSTAL_COL.date] = this.number(dateToSerial(entry.entryDate));
            row[POSTAL_COL.amount] = this.number(item.amount);
            return row;
        });

        const sum = this.blankRow();
        sum[POSTAL_COL.amount] = this.formula(
            this.buildSumFormula(firstItemRow, lastItemRow)
        );
        // Sposob platnosci i osoba w jednej komorce, jak w blokach wpisanych recznie.
        sum[POSTAL_COL.payer] = this.text(entry.sheetPayerLabel);

        return [header, ...items, sum];
    }

    static buildRequests(
        entry: PettyCashEntry,
        sheetId: number,
        blockNumber: number,
        headerRow: number,
        previous: RegisterBlock,
        labels: { tracking: string; date: string; amount: string },
        trackingUrlTemplate = ''
    ): any[] {
        const itemCount = entry._dispatch!.items.length;
        const firstItemRow = headerRow + 1;
        const lastItemRow = headerRow + itemCount;
        const sumRow = lastItemRow + 1;

        const rowRange = (row: number, span = 1) => ({
            sheetId,
            startRowIndex: row - 1,
            endRowIndex: row - 1 + span,
            startColumnIndex: 0,
            endColumnIndex: POSTAL_VISIBLE_WIDTH,
        });
        const copyFormat = (sourceRow: number, targetRow: number, span = 1) => ({
            copyPaste: {
                source: rowRange(sourceRow),
                destination: rowRange(targetRow, span),
                pasteType: 'PASTE_FORMAT',
            },
        });

        const formatColumn = (column: number, endRow: number, type: 'DATE' | 'NUMBER', pattern: string) => ({
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: firstItemRow - 1,
                    endRowIndex: endRow,
                    startColumnIndex: column,
                    endColumnIndex: column + 1,
                },
                cell: { userEnteredFormat: { numberFormat: { type, pattern } } },
                fields: 'userEnteredFormat.numberFormat',
            },
        });

        return [
            // Blok robi sobie miejsce sam, zamiast wpisywac sie w istniejace puste wiersze.
            // Pod ostatnim blokiem bylo ich tylko 21, a nizej stoi ksiazka adresowa e-maili -
            // przy dwoch wysylkach tygodniowo to miejsce konczy sie po kilku tygodniach.
            // Wstawianie przesuwa ksiazke w dol i problem nie wraca.
            {
                insertDimension: {
                    range: {
                        sheetId,
                        dimension: 'ROWS',
                        startIndex: headerRow - 1,
                        endIndex: headerRow - 1 + itemCount + 2,
                    },
                    inheritFromBefore: true,
                },
            },
            {
                updateCells: {
                    start: { sheetId, rowIndex: headerRow - 1, columnIndex: 0 },
                    rows: this.buildBlockRows(
                        entry,
                        blockNumber,
                        headerRow,
                        labels,
                        trackingUrlTemplate
                    ).map((values) => ({ values })),
                    fields: 'userEnteredValue',
                },
            },
            // Pod ostatnim blokiem nie ma formatowania do odziedziczenia - kopiujemy je
            // z bloku wyzej, kazdy rodzaj wiersza ze swojego odpowiednika.
            copyFormat(previous.headerRow, headerRow),
            copyFormat(previous.firstItemRow, firstItemRow, itemCount),
            copyFormat(previous.sumRow, sumRow),
            // Kopiowanie formatu moze przeniesc scalenia zrodla; czyscimy je i zakladamy wlasne,
            // zeby ksztalt bloku byl zawsze taki sam, niezaleznie od tego, co skopiowal Google.
            {
                unmergeCells: {
                    range: {
                        sheetId,
                        startRowIndex: headerRow - 1,
                        endRowIndex: sumRow,
                        startColumnIndex: 0,
                        endColumnIndex: POSTAL_WIDTH,
                    },
                },
            },
            formatColumn(POSTAL_COL.date, lastItemRow, 'DATE', 'dd-mm-yyyy'),
            formatColumn(POSTAL_COL.amount, sumRow, 'NUMBER', '#,##0.00'),
            {
                mergeCells: {
                    mergeType: 'MERGE_ALL',
                    range: {
                        sheetId,
                        startRowIndex: headerRow - 1,
                        endRowIndex: sumRow,
                        startColumnIndex: POSTAL_COL.blockNumber,
                        endColumnIndex: POSTAL_COL.blockNumber + 1,
                    },
                },
            },
            {
                mergeCells: {
                    mergeType: 'MERGE_ALL',
                    range: {
                        sheetId,
                        startRowIndex: headerRow - 1,
                        endRowIndex: headerRow,
                        startColumnIndex: POSTAL_COL.itemIndex,
                        endColumnIndex: POSTAL_COL.contents + 1,
                    },
                },
            },
            // Kolumna techniczna ma byc niewidoczna; zadanie idempotentne, wiec leci za kazdym razem.
            {
                updateDimensionProperties: {
                    range: {
                        sheetId,
                        dimension: 'COLUMNS',
                        startIndex: POSTAL_COL.marker,
                        endIndex: POSTAL_COL.marker + 1,
                    },
                    properties: { hiddenByUser: true },
                    fields: 'hiddenByUser',
                },
            },
            // Scalenie daty tylko przy wielu listach - przy jednym nie ma czego scalac.
            ...(itemCount > 1
                ? [
                      {
                          mergeCells: {
                              mergeType: 'MERGE_ALL',
                              range: {
                                  sheetId,
                                  startRowIndex: firstItemRow - 1,
                                  endRowIndex: lastItemRow,
                                  startColumnIndex: POSTAL_COL.date,
                                  endColumnIndex: POSTAL_COL.date + 1,
                              },
                          },
                      },
                  ]
                : []),
        ];
    }

    // ----------------------------------------------------------------- plan

    static plan(
        entry: PettyCashEntry,
        snapshot: RegisterSnapshot,
        trackingUrlTemplate = ''
    ): RegisterPlan {
        if (!entry.requiresPostalDispatch)
            return { action: 'blocked', reason: 'Ten wpis nie jest wysylka pocztowa.' };

        const errors = entry.consistencyErrors();
        if (errors.length)
            return { action: 'blocked', reason: `Wpis niespojny: ${errors.join(' ')}` };

        const dispatch = entry._dispatch!;

        const existing = this.inspectEntry(entry, snapshot);
        if (existing) return existing;

        const previous = this.findLastBlock(snapshot.rows);
        const empty = this.isPreparedEmpty(snapshot);
        if (!previous && !empty)
            return { action: 'blocked', code: 'ANNUAL_SHEET_INCOMPLETE', reason: 'Brak kompletnego bloku lub przygotowanej struktury poczty.' };
        const source = previous ?? { blockNumber: 0, headerRow: 5, firstItemRow: 6, lastItemRow: 6, sumRow: 7 };
        const headerRow = previous ? previous.sumRow + 2 : 5;
        const sumRow = headerRow + dispatch.items.length + 1;

        // Nie sprawdzamy juz, czy wiersze docelowe sa puste: blok wstawia sobie wiersze,
        // wiec sa puste z definicji, a wszystko ponizej - lacznie z ksiazka adresowa -
        // przesuwa sie w dol zamiast zostac nadpisane.

        const requests = this.buildRequests(entry, snapshot.tab.sheetId, source.blockNumber + 1,
            headerRow, source, this.readHeaderLabels(snapshot.rows, source.headerRow), trackingUrlTemplate);
        if (!previous) {
            requests.shift();
            // Preserve the sum format before filling rows that can overlap its template cell.
            const formats = requests.filter(r => r.copyPaste);
            requests.splice(0, requests.length, ...formats.reverse(), ...requests.filter(r => !r.copyPaste));
        }
        return {
            action: 'write',
            blockNumber: source.blockNumber + 1,
            headerRow,
            firstItemRow: headerRow + 1,
            sumRow,
            requests,
        };
    }

    static inspectEntry(entry: PettyCashEntry, snapshot: RegisterSnapshot): RegisterPlan | null {
        const dispatch = entry._dispatch!;
        const key = dispatch.invoiceNumber.trim().toLowerCase();
        const matches = snapshot.rows.flatMap((row, i) =>
            row[1]?.trim().toLowerCase() === key || row[8]?.trim() === dispatch.sheetMarker() ? [i + 1] : []);
        if (!matches.length) return null;
        const conflict = (): RegisterPlan => ({ action: 'blocked', reason: 'Ta faktura jest już w rejestrze z inną lub niepełną treścią. Sprawdź arkusz.' });
        if (matches.length !== 1) return conflict();
        const header = matches[0], sum = this.findSumRow(snapshot.rows, header);
        if (!sum || sum !== header + dispatch.items.length + 1 || !/^\d+$/.test(this.cell(snapshot.rows, header, 0))) return conflict();
        const marker = this.cell(snapshot.rows, header, 8);
        if (marker && marker !== dispatch.sheetMarker()) return conflict();
        if (this.cell(snapshot.rows, header, 1).toLowerCase() !== key) return conflict();
        if (this.cell(snapshot.rows, sum, 6).replace(/\s|\$/g, '').toUpperCase() !== this.buildSumFormula(header + 1, sum - 1)) return conflict();
        if (this.cell(snapshot.rows, sum, 7) !== entry.sheetPayerLabel) return conflict();
        for (let i = 0; i < dispatch.items.length; i++) {
            const row = header + 1 + i, item = dispatch.items[i];
            if (this.cell(snapshot.rows, row, 1) !== String(i + 1) ||
                this.cell(snapshot.rows, row, 2) !== item.addressee ||
                this.cell(snapshot.rows, row, 3) !== (item.contentsDescription ?? '') ||
                PostalDispatchItem.normalizeTrackingNumber(this.readTrackingCell(snapshot.rows, row)) !== item.trackingNumber ||
                this.cell(snapshot.rows, row, 6) === '' || Number(this.cell(snapshot.rows, row, 6)) !== item.amount ||
                (i === 0 ? Number(this.cell(snapshot.rows, row, 5)) !== dateToSerial(entry.entryDate) : this.cell(snapshot.rows, row, 5) !== '')) return conflict();
        }
        return { action: 'skip', existingRow: header, reason: 'Wpis poczty już istnieje i ma zgodną treść.' };
    }

    static isPreparedEmpty(snapshot: RegisterSnapshot): boolean {
        if (snapshot.rows[0]?.[8] !== 'office-postal:v1') return false;
        if (this.readHeaderLabels(snapshot.rows, 5).tracking.trim() !== 'nr listu' ||
            this.readHeaderLabels(snapshot.rows, 5).date.trim() !== 'data' ||
            this.readHeaderLabels(snapshot.rows, 5).amount.trim() !== 'kwota') return false;
        return snapshot.rows.every((row, index) => row.every((value, col) =>
            !value || (index === 0 && col === 8) || ((index === 1 || index === 2) && (col === 0 || col === 2)) ||
            (index === 4 && [4, 5, 6].includes(col))));
    }

    static async ensureDestination(auth: OAuth2Client, spreadsheetId: string, year: number): Promise<RegisterSnapshot> {
        const meta = (await ToolsSheets.getSpreadSheet(auth, spreadsheetId)).data;
        const candidates = (meta.sheets ?? []).filter(s => (s.properties?.title ?? '').toLowerCase().includes('poczta') && (s.properties?.title ?? '').includes(String(year)));
        const fail = (message: string): never => { throw new AnnualSheetStructureError('ANNUAL_SHEET_INCOMPLETE', 'postal', year, message); };
        if (candidates.length > 1) fail('Niejednoznaczna zakładka poczty. Sprawdź arkusz.');
        if (!candidates.length) {
            let source: RegisterSnapshot;
            try { source = await this.loadSnapshot(auth, spreadsheetId, year - 1); }
            catch (error) {
                if (error instanceof AnnualSheetStructureError) throw new AnnualSheetStructureError(error.code, 'postal', year, `Brak zakładki poczty ${year - 1} ze wzorem struktury.`);
                throw error;
            }
            const sum = this.findSumRow(source.rows, 5);
            const labels = this.readHeaderLabels(source.rows, 5);
            if (this.cell(source.rows, 5, 0) !== '1' || !sum || sum < 7 ||
                this.cell(source.rows, sum, 6).replace(/\s|\$/g, '').toUpperCase() !== this.buildSumFormula(6, sum - 1) ||
                labels.tracking.trim() !== 'nr listu' || labels.date.trim() !== 'data' || labels.amount.trim() !== 'kwota' ||
                this.cell(source.rows, 2, 0) !== 'rozlicz zaliczkę' || this.cell(source.rows, 3, 0) !== 'ZMIEŃ status fv') fail('Nieprawidłowy wzór pierwszego bloku poczty. Sprawdź poprzedni rok.');
            const layout = await ToolsSheets.getSpreadSheet(auth, spreadsheetId, {
                ranges: ["'" + source.tab.title.replace(/'/g, "''") + "'!A1:H1"],
                fields: 'sheets(properties(sheetId),data(startColumn,columnMetadata(pixelSize)))',
            });
            const dimensions = layout.data.sheets?.find(sheet => sheet.properties?.sheetId === source.tab.sheetId)?.data;
            const columns = dimensions?.find(grid => (grid.startColumn ?? 0) === 0)?.columnMetadata ?? [];
            const sheetId = randomInt(1, 2147483647);
            const range = (id: number, first: number, last: number) => ({ sheetId: id, startRowIndex: first - 1, endRowIndex: last, startColumnIndex: 0, endColumnIndex: 8 });
            const requests: any[] = [{ addSheet: { properties: { sheetId, title: `poczta wych. ${year}`, gridProperties: { rowCount: 1000, columnCount: 9 } } } }];
            // PASTE_FORMAT does not copy column dimensions. Keep the previous year's layout.
            for (const [column, metadata] of columns.slice(0, POSTAL_VISIBLE_WIDTH).entries()) {
                const pixelSize = metadata.pixelSize;
                if (typeof pixelSize !== 'number' || !Number.isInteger(pixelSize) || pixelSize <= 0) continue;
                requests.push({
                    updateDimensionProperties: {
                        range: { sheetId, dimension: 'COLUMNS', startIndex: column, endIndex: column + 1 },
                        properties: { pixelSize },
                        fields: 'pixelSize',
                    },
                });
            }
            for (const [sourceRow, targetRow, span] of [[1, 1, 4], [5, 5, 1], [6, 6, 1], [sum!, 7, 1]]) requests.push({ copyPaste: {
                source: range(source.tab.sheetId, sourceRow, sourceRow + span - 1), destination: range(sheetId, targetRow, targetRow + span - 1), pasteType: 'PASTE_FORMAT' } });
            requests.push({ unmergeCells: { range: range(sheetId, 1, 7) } });
            const sourceMeta = (meta.sheets ?? []).find(s => s.properties?.sheetId === source.tab.sheetId);
            for (const merge of sourceMeta?.merges ?? []) {
                if ((merge.endRowIndex ?? 0) <= 4 && (merge.endColumnIndex ?? 0) <= POSTAL_VISIBLE_WIDTH)
                    requests.push({ mergeCells: { range: { ...merge, sheetId }, mergeType: 'MERGE_ALL' } });
            }
            const rows = Array.from({ length: 5 }, () => this.blankRow());
            rows[0][8] = this.text('office-postal:v1');
            for (const r of [1, 2]) for (const c of [0, 2]) {
                const value = source.rows[r]?.[c] ?? '';
                if (value.startsWith('=')) fail('Nieoczekiwana formuła w statycznym nagłówku poczty.');
                rows[r][c] = this.text(value);
            }
            rows[4][4] = this.text(labels.tracking); rows[4][5] = this.text(labels.date); rows[4][6] = this.text(labels.amount);
            requests.push({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 }, rows: rows.map(values => ({ values })), fields: 'userEnteredValue' } },
                { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } });
            await ToolsSheets.batchUpdateSheet(auth, requests, spreadsheetId);
        }
        const snapshot = await this.loadSnapshot(auth, spreadsheetId, year);
        const last = this.findLastBlock(snapshot.rows);
        if (!last && !this.isPreparedEmpty(snapshot)) fail('Zakładka poczty jest pusta lub niekompletna. Sprawdź arkusz.');
        if (last) {
            let previousNumber = 0, previousSum = 0;
            for (let r = 1; r <= snapshot.rows.length; r++) {
                if (!/^\d+$/.test(this.cell(snapshot.rows, r, 0))) continue;
                const number = Number(this.cell(snapshot.rows, r, 0)), sum = this.findSumRow(snapshot.rows, r);
                const labels = this.readHeaderLabels(snapshot.rows, r);
                if (number <= previousNumber || r <= previousSum || !sum || sum <= r + 1 ||
                    this.cell(snapshot.rows, sum, 6).replace(/\s|\$/g, '').toUpperCase() !== this.buildSumFormula(r + 1, sum - 1) ||
                    !this.cell(snapshot.rows, r, 1) || labels.tracking.trim() !== 'nr listu' || labels.date.trim() !== 'data' || labels.amount.trim() !== 'kwota')
                    fail('Bloki poczty są niekompletne lub niejednoznaczne. Sprawdź numerację, nagłówki i sumy.');
                previousNumber = number; previousSum = sum!;
            }
        }
        return snapshot;
    }

    // ---------------------------------------------------------------- zapis

    static async write(
        auth: OAuth2Client,
        entry: PettyCashEntry,
        options: {
            spreadsheetId: string;
            trackingUrlTemplate?: string;
        }
    ): Promise<RegisterPlan> {
        const year = Number(entry.entryDate.slice(0, 4));
        const snapshot = await this.ensureDestination(auth, options.spreadsheetId, year);
        const plan = this.plan(entry, snapshot, options.trackingUrlTemplate ?? '');

        if (plan.action === 'write')
            await ToolsSheets.batchUpdateSheet(
                auth,
                plan.requests,
                options.spreadsheetId
            );

        return plan;
    }
}
