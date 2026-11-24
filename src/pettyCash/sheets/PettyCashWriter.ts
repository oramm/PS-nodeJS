import CashSheetStructure from './CashSheetStructure';
import AnnualSheetStructureError from './AnnualSheetStructureError';
import { OAuth2Client } from 'google-auth-library';
import ToolsSheets from '../../tools/ToolsSheets';
import PettyCashEntry from '../PettyCashEntry';
import {
    EXPENSE_FORMULA_PATTERN,
    MONTH_ABBREVIATIONS,
    MONTH_SUM_PATTERN,
    PETTY_CASH_COL,
    PETTY_CASH_WIDTH,
} from './pettyCashSheetConfig';
import { dateToSerial, serialToMonthKey } from './sheetDates';

export type TabRef = { title: string; sheetId: number };

export type MonthBlock = {
    /** 'YYYY-MM' wyprowadzone z kolumny A wiersza zbiorczego */
    monthKey: string;
    /** numer wiersza zbiorczego, 1-based */
    aggregateRow: number;
    /** pierwszy i ostatni wiersz danych, prosto z formuly =SUM(B<first>:B<last>) */
    firstDataRow: number;
    lastDataRow: number;
};

/** Zakladka wczytana raz, w postaci formul. Wszystkie decyzje zapadaja na tej migawce. */
export type SheetSnapshot = { tab: TabRef; rows: string[][] };

export type WritePlan =
    | { action: 'write'; targetRow: number; formatSourceRow: number | null; requests: any[] }
    | { action: 'skip'; reason: string; existingRow: number }
    | { action: 'blocked'; reason: string; code?: 'ANNUAL_SHEET_INCOMPLETE' };

/**
 * Wstawia jeden wiersz wpisu do arkusza zaliczek.
 *
 * Zasady, ktore ta klasa realizuje (P0 potwierdzil je odczytem zywej struktury):
 *  - piszemy w pierwszy WOLNY wiersz wewnatrz zakresu sumy biezacego miesiaca;
 *    nie wstawiamy wiersza, dopoki jest tam miejsce, wiec nic sie nie przesuwa,
 *  - zakres miesiaca czytamy z formuly =SUM(...), nie z arytmetyki na numerach,
 *  - przed planowaniem uzgadniamy roczna i miesieczna strukture,
 *  - piszemy formuly (=G<r>, =E<r>+F<r>), nie gole liczby, zeby wiersz byl taki
 *    sam jak wpisany przez czlowieka,
 *  - formatowanie kopiujemy z najblizszego kanonicznego wiersza danych, bo puste
 *    wiersze miesiaca maja format tylko w kolumnie wplywu,
 *  - znacznik w ukrytej kolumnie N sluzy jednokrotnosci: po nim poznajemy wpis, ktory
 *    system juz dodal. Istniejacych wierszy nie edytujemy w ogole, wiec nie ma czego chronic.
 */
export default class PettyCashWriter {
    // ---------------------------------------------------------------- odczyt

    /** Dopasowanie po roku, odporne na wielkosc liter i spacje w tytule zakladki. */
    static matchTabTitle(titles: string[], year: number): string | null {
        const wanted = String(year);
        const normalized = titles.map((title) => ({
            title,
            key: title.trim().toLowerCase().replace(/\s+/g, ' '),
        }));
        const exact = normalized.filter((t) => t.key === `zaliczki ${wanted}`);
        if (exact.length > 1) return null;
        if (exact.length === 1) return exact[0].title;
        const containing = normalized.filter((t) => t.key.includes(wanted));
        return containing.length === 1 ? containing[0].title : null;
    }

    static async loadSnapshot(
        auth: OAuth2Client,
        spreadsheetId: string,
        year: number
    ): Promise<SheetSnapshot> {
        const meta = await ToolsSheets.getSpreadSheet(auth, spreadsheetId);
        const sheets = meta.data.sheets ?? [];
        const titles = sheets.map((s) => s.properties?.title ?? '');
        const title = this.matchTabTitle(titles, year);
        if (!title)
            throw new AnnualSheetStructureError(
                'ANNUAL_SHEET_MISSING',
                'cash',
                year,
                `Nie znaleziono jednoznacznej zakładki zaliczek dla roku ${year}. Sprawdź zakładkę tego roku w arkuszu lub skontaktuj się z administratorem.`
            );
        const sheetId =
            sheets.find((s) => s.properties?.title === title)?.properties?.sheetId ?? 0;

        const data = await ToolsSheets.getValues(auth, {
            spreadsheetId,
            rangeA1: `'${title.replace(/'/g, "''")}'!A:N`,
            valueRenderOption: 'FORMULA',
        });

        return {
            tab: { title, sheetId },
            rows: ((data.values ?? []) as any[][]).map((row) =>
                Array.from({ length: PETTY_CASH_WIDTH }, (_, i) =>
                    row[i] === undefined || row[i] === null ? '' : String(row[i])
                )
            ),
        };
    }

    // ------------------------------------------------------- analiza migawki

    static cell(rows: string[][], row1Based: number, col: number): string {
        return (rows[row1Based - 1]?.[col] ?? '').trim();
    }

    /**
     * Numer seryjny arkusza na 'YYYY-MM'. Wiersz zbiorczy trzyma w kolumnie A prawdziwa
     * date sformatowana jako 'sie 2026', wiec przy odczycie formul wraca liczba, nie tekst.
     */
    static serialToMonthKey = serialToMonthKey;

    static dateToSerial = dateToSerial;

    /** Obsluguje i date (liczba seryjna), i zapis tekstowy w rodzaju 'sie 2026'. */
    static labelToMonthKey(label: string): string | null {
        const trimmed = label.trim();
        if (!trimmed) return null;

        const asNumber = Number(trimmed.replace(',', '.'));
        if (Number.isFinite(asNumber) && asNumber > 0)
            return this.serialToMonthKey(asNumber);

        const match = trimmed
            .toLowerCase()
            .replace(/ź/g, 'z')
            .match(/^([a-z]{3})[a-z]*\.?\s+(\d{4})$/);
        if (!match) return null;
        const month = MONTH_ABBREVIATIONS[match[1]];
        return month ? `${match[2]}-${String(month).padStart(2, '0')}` : null;
    }

    static parseMonthBlocks(rows: string[][]): MonthBlock[] {
        const blocks: MonthBlock[] = [];
        for (let row = 1; row <= rows.length; row++) {
            const sum = this.cell(rows, row, PETTY_CASH_COL.inflow);
            const match = sum.match(MONTH_SUM_PATTERN);
            if (!match) continue;
            const monthKey = this.labelToMonthKey(
                this.cell(rows, row, PETTY_CASH_COL.date)
            );
            if (!monthKey) continue;
            blocks.push({
                monthKey,
                aggregateRow: row,
                firstDataRow: Number(match[1]),
                lastDataRow: Number(match[2] ?? match[1]),
            });
        }
        return blocks;
    }

    static isRowEmpty(rows: string[][], row: number): boolean {
        for (let col = 0; col < PETTY_CASH_WIDTH; col++)
            if (this.cell(rows, row, col) !== '') return false;
        return true;
    }

    static findFreeRow(rows: string[][], block: MonthBlock): number | null {
        for (let row = block.firstDataRow; row <= block.lastDataRow; row++)
            if (this.isRowEmpty(rows, row)) return row;
        return null;
    }

    /**
     * Wiersz, z ktorego kopiujemy formatowanie: najblizszy kanoniczny wiersz danych,
     * czyli taki, ktory ma w kolumnie wydatku formule =E<n>+F<n>. Szukamy najpierw
     * w gore, potem w dol. Puste wiersze miesiaca maja format tylko w kolumnie B,
     * wiec dziedziczenie z gory nic by nie dalo.
     */
    static findFormatSourceRow(rows: string[][], targetRow: number): number | null {
        const isCanonical = (row: number) =>
            EXPENSE_FORMULA_PATTERN.test(this.cell(rows, row, PETTY_CASH_COL.expense));
        for (let row = targetRow - 1; row >= 1; row--) if (isCanonical(row)) return row;
        for (let row = targetRow + 1; row <= rows.length; row++)
            if (isCanonical(row)) return row;
        return null;
    }

    /** Czy ten sam wpis juz w arkuszu jest - jako wiersz robota albo wpisany recznie. */
    static findExistingRow(
        rows: string[][],
        entry: PettyCashEntry,
        block: MonthBlock
    ): { row: number; reason: string } | null {
        const marker = entry.sheetMarker();
        for (let row = 1; row <= rows.length; row++)
            if (this.cell(rows, row, PETTY_CASH_COL.marker) === marker)
                return { row, reason: 'Ten wpis zostal juz dodany przez system.' };

        if (entry.documentNumber) {
            const wanted = entry.documentNumber.trim().toLowerCase();
            for (let row = block.firstDataRow; row <= block.lastDataRow; row++)
                if (
                    this.cell(rows, row, PETTY_CASH_COL.documentNumber)
                        .toLowerCase() === wanted
                )
                    return {
                        row,
                        reason: `Dokument ${entry.documentNumber} jest juz w arkuszu w wierszu ${row}.`,
                    };
        }
        return null;
    }

    /** Postal retry must prove contents, including manually entered document rows. */
    static inspectPostalEntry(entry: PettyCashEntry, snapshot: SheetSnapshot): WritePlan | null {
        const key = entry.documentNumber?.trim().toLowerCase();
        const matches = snapshot.rows.flatMap((row, i) =>
            row[13]?.trim() === entry.sheetMarker() || (key && row[7]?.trim().toLowerCase() === key) ? [i + 1] : []);
        if (!matches.length) return null;
        const conflict = (): WritePlan => ({ action: 'blocked', reason: 'Dokument w zaliczkach ma inną lub niepełną treść. Sprawdź arkusz.' });
        if (matches.length !== 1) return conflict();
        const row = matches[0], actual = snapshot.rows[row - 1];
        const block = this.parseMonthBlocks(snapshot.rows).find(b => b.monthKey === entry.entryDate.slice(0, 7));
        if (!block || row < block.firstDataRow || row > block.lastDataRow) return conflict();
        const expected = this.buildRowCells(entry, row);
        for (let c = 0; c < PETTY_CASH_WIDTH; c++) {
            const cell = expected[c].userEnteredValue ?? {};
            const value = actual[c]?.trim() ?? '';
            if (c === PETTY_CASH_COL.marker && !value) continue; // manual entry
            if (cell.numberValue !== undefined) {
                if (!value || Number(value) !== cell.numberValue) return conflict();
            } else if (cell.formulaValue !== undefined) {
                if (value.replace(/\s|\$/g, '').toUpperCase() !== cell.formulaValue.toUpperCase()) return conflict();
            } else if (c === PETTY_CASH_COL.documentNumber) {
                if (value.toLowerCase() !== String(cell.stringValue ?? '').toLowerCase()) return conflict();
            } else if (value !== (cell.stringValue ?? '')) return conflict();
        }
        return { action: 'skip', existingRow: row, reason: 'Wpis zaliczek już istnieje i ma zgodną treść.' };
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
    private static blank() {
        return {};
    }

    /** Wiersz A..N w postaci, w jakiej trafi do arkusza. */
    static buildRowCells(entry: PettyCashEntry, row: number): any[] {
        const cells: any[] = Array.from({ length: PETTY_CASH_WIDTH }, () =>
            this.blank()
        );

        cells[PETTY_CASH_COL.date] = this.number(this.dateToSerial(entry.entryDate));
        cells[PETTY_CASH_COL.description] = this.text(entry.description);

        if (entry.settlementMethod === 'CARD')
            cells[PETTY_CASH_COL.inflow] = this.formula(`=G${row}`);
        else if (entry.settlementMethod === 'ADVANCE' && entry.inflowAmount !== null)
            cells[PETTY_CASH_COL.inflow] = this.number(entry.inflowAmount);

        if (entry.netAmount !== null)
            cells[PETTY_CASH_COL.net] = this.number(entry.netAmount);
        if (entry.grossAmount !== null)
            cells[PETTY_CASH_COL.gross] = this.number(entry.grossAmount);
        if (entry.noDocumentAmount !== null)
            cells[PETTY_CASH_COL.noDocument] = this.number(entry.noDocumentAmount);

        cells[PETTY_CASH_COL.expense] = this.formula(`=E${row}+F${row}`);

        if (entry.documentNumber)
            cells[PETTY_CASH_COL.documentNumber] = this.text(entry.documentNumber);
        // Sposob platnosci i osoba w jednej komorce, jak w wierszach wpisanych recznie.
        cells[PETTY_CASH_COL.payer] = this.text(entry.sheetPayerLabel);
        if (entry.note) cells[PETTY_CASH_COL.note] = this.text(entry.note);

        cells[PETTY_CASH_COL.marker] = this.text(entry.sheetMarker());

        return cells;
    }

    static buildRequests(
        entry: PettyCashEntry,
        sheetId: number,
        targetRow: number,
        formatSourceRow: number | null
    ): any[] {
        const requests: any[] = [];

        if (formatSourceRow !== null)
            requests.push({
                copyPaste: {
                    source: {
                        sheetId,
                        startRowIndex: formatSourceRow - 1,
                        endRowIndex: formatSourceRow,
                        startColumnIndex: 0,
                        endColumnIndex: PETTY_CASH_WIDTH,
                    },
                    destination: {
                        sheetId,
                        startRowIndex: targetRow - 1,
                        endRowIndex: targetRow,
                        startColumnIndex: 0,
                        endColumnIndex: PETTY_CASH_WIDTH,
                    },
                    pasteType: 'PASTE_FORMAT',
                },
            });

        requests.push({
            updateCells: {
                start: { sheetId, rowIndex: targetRow - 1, columnIndex: 0 },
                rows: [{ values: this.buildRowCells(entry, targetRow) }],
                fields: 'userEnteredValue',
            },
        });

        requests.push(this.buildDateFormatRequest(sheetId, targetRow, targetRow));

        // Kolumna techniczna ma byc niewidoczna. Zadanie jest idempotentne, wiec dokladamy
        // je do kazdego zapisu - kolumna sama wraca do ukrycia, jesli ktos ja odslonil.
        requests.push(this.buildHideMarkerColumn(sheetId));

        return requests;
    }

    static buildDateFormatRequest(sheetId: number, firstRow: number, lastRow: number, pattern = 'yyyy-mm-dd') {
        return {
            repeatCell: {
                range: {
                    sheetId,
                    startRowIndex: firstRow - 1,
                    endRowIndex: lastRow,
                    startColumnIndex: PETTY_CASH_COL.date,
                    endColumnIndex: PETTY_CASH_COL.date + 1,
                },
                cell: { userEnteredFormat: { numberFormat: { type: 'DATE', pattern } } },
                fields: 'userEnteredFormat.numberFormat',
            },
        };
    }

    static buildHideMarkerColumn(sheetId: number) {
        return {
            updateDimensionProperties: {
                range: {
                    sheetId,
                    dimension: 'COLUMNS',
                    startIndex: PETTY_CASH_COL.marker,
                    endIndex: PETTY_CASH_COL.marker + 1,
                },
                properties: { hiddenByUser: true },
                fields: 'hiddenByUser',
            },
        };
    }

    /**
     * Awaryjne poszerzenie miesiaca, gdy zabraklo wolnych wierszy.
     * Wstawiamy PRZED ostatnim wierszem zakresu, zeby Google rozszerzyl formule sumy;
     * wstawienie za nim zostawiloby wpis poza suma miesiaca.
     */
    static buildRangeExpansion(sheetId: number, block: MonthBlock) {
        return {
            insertDimension: {
                range: {
                    sheetId,
                    dimension: 'ROWS',
                    startIndex: block.lastDataRow - 1,
                    endIndex: block.lastDataRow,
                },
                inheritFromBefore: true,
            },
        };
    }

    // ----------------------------------------------------------------- plan

    static plan(entry: PettyCashEntry, snapshot: SheetSnapshot): WritePlan {
        const errors = entry.consistencyErrors();
        if (errors.length)
            return { action: 'blocked', reason: `Wpis niespojny: ${errors.join(' ')}` };

        const monthKey = entry.entryDate.slice(0, 7);
        const block = this.parseMonthBlocks(snapshot.rows).find(
            (b) => b.monthKey === monthKey
        );
        if (!block)
            return {
                action: 'blocked',
                code: 'ANNUAL_SHEET_INCOMPLETE',
                reason:
                    `W zakladce "${snapshot.tab.title}" nie ma jeszcze wiersza zbiorczego dla ` +
                    `miesiaca ${monthKey}. Zaloz go recznie - system tego nie robi.`,
            };

        const existing = this.findExistingRow(snapshot.rows, entry, block);
        if (existing)
            return { action: 'skip', reason: existing.reason, existingRow: existing.row };

        // Zwykle jest wolny wiersz w zakresie miesiaca. Gdy go nie ma, miesiac
        // poszerzamy wstawieniem wiersza WEWNATRZ zakresu, zeby suma go objela.
        const freeRow = this.findFreeRow(snapshot.rows, block);
        const targetRow = freeRow ?? block.lastDataRow;
        const formatSourceRow = this.findFormatSourceRow(snapshot.rows, targetRow);

        return {
            action: 'write',
            targetRow,
            formatSourceRow,
            requests: [
                ...(freeRow === null
                    ? [this.buildRangeExpansion(snapshot.tab.sheetId, block)]
                    : []),
                ...this.buildRequests(
                    entry,
                    snapshot.tab.sheetId,
                    targetRow,
                    formatSourceRow
                ),
            ],
        };
    }

    /** Serializes all cash reads/provisioning/writes for one file in this process.
     * Multi-process writers require an external shared lock before deployment. */
    private static pending = new Map<string, Promise<unknown>>();

    static async withWriteLock<T>(spreadsheetId: string, work: () => Promise<T>): Promise<T> {
        const previous = this.pending.get(spreadsheetId) ?? Promise.resolve();
        const current = previous.catch(() => undefined).then(work);
        this.pending.set(spreadsheetId, current);
        try { return await current; }
        finally { if (this.pending.get(spreadsheetId) === current) this.pending.delete(spreadsheetId); }
    }

    /** Call under withWriteLock when coordinating a multi-file operation. */
    static async ensureDestination(auth: OAuth2Client, entry: PettyCashEntry, spreadsheetId: string): Promise<SheetSnapshot> {
        return CashSheetStructure.ensure(auth, spreadsheetId,
            Number(entry.entryDate.slice(0, 4)), Number(entry.entryDate.slice(5, 7)));
    }

    // ---------------------------------------------------------------- zapis

    static async write(
        auth: OAuth2Client,
        entry: PettyCashEntry,
        options: { spreadsheetId: string }
    ): Promise<WritePlan> {
        const errors = entry.consistencyErrors();
        if (errors.length) return { action: 'blocked', reason: `Wpis niespojny: ${errors.join(' ')}` };
        return this.withWriteLock(options.spreadsheetId, () => this.writeLocked(auth, entry, options));
    }

    /** Caller owns the cash-file lock, including multi-file preflight. */
    static async writeLocked(auth: OAuth2Client, entry: PettyCashEntry,
        options: { spreadsheetId: string }): Promise<WritePlan> {

            let snapshot = await this.ensureDestination(auth, entry, options.spreadsheetId);
            if (entry.requiresPostalDispatch) {
                const existing = this.inspectPostalEntry(entry, snapshot);
                if (existing) return existing;
            }
            const block = this.parseMonthBlocks(snapshot.rows).find(b => b.monthKey === entry.entryDate.slice(0, 7))!;
            if (!this.findExistingRow(snapshot.rows, entry, block) && this.findFreeRow(snapshot.rows, block) === null) {
                const requests: any[] = [this.buildRangeExpansion(snapshot.tab.sheetId, block)];
                if (block.firstDataRow === block.lastDataRow) {
                    // Inserting before the only cell moves rather than expands SUM.
                    for (const column of ['B', 'D', 'E', 'F', 'G']) requests.push({ updateCells: {
                        start: { sheetId: snapshot.tab.sheetId, rowIndex: block.aggregateRow - 1, columnIndex: column.charCodeAt(0) - 65 },
                        rows: [{ values: [{ userEnteredValue: { formulaValue: `=SUM(${column}${block.firstDataRow}:${column}${block.lastDataRow + 1})` } }] }],
                        fields: 'userEnteredValue',
                    } });
                }
                await ToolsSheets.batchUpdateSheet(auth, requests, options.spreadsheetId);
                snapshot = await this.ensureDestination(auth, entry, options.spreadsheetId);
            }
            const plan = this.plan(entry, snapshot);
            if (plan.action === 'write')
                await ToolsSheets.batchUpdateSheet(auth, plan.requests, options.spreadsheetId);
            return plan;
    }
}
