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
    | { action: 'blocked'; reason: string };

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
        const exact = normalized.find((t) => t.key === `poczta wych. ${wanted}`);
        if (exact) return exact.title;
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
            throw new Error(
                `Rejestr listow nie ma zakladki dla roku ${year}. Zakladki: ${titles.join(', ')}`
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

        const existing = this.findExistingBlock(snapshot.rows, dispatch.invoiceNumber);
        if (existing)
            return { action: 'skip', reason: existing.reason, existingRow: existing.row };

        const previous = this.findLastBlock(snapshot.rows);
        if (!previous)
            return {
                action: 'blocked',
                reason:
                    `W zakladce "${snapshot.tab.title}" nie znaleziono zadnego kompletnego bloku. ` +
                    'Bez niego nie ma skad wziac numeracji ani formatowania.',
            };

        const headerRow = previous.sumRow + 2;
        const sumRow = headerRow + dispatch.items.length + 1;

        // Nie sprawdzamy juz, czy wiersze docelowe sa puste: blok wstawia sobie wiersze,
        // wiec sa puste z definicji, a wszystko ponizej - lacznie z ksiazka adresowa -
        // przesuwa sie w dol zamiast zostac nadpisane.

        return {
            action: 'write',
            blockNumber: previous.blockNumber + 1,
            headerRow,
            firstItemRow: headerRow + 1,
            sumRow,
            requests: this.buildRequests(
                entry,
                snapshot.tab.sheetId,
                previous.blockNumber + 1,
                headerRow,
                previous,
                this.readHeaderLabels(snapshot.rows, previous.headerRow),
                trackingUrlTemplate
            ),
        };
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
        const snapshot = await this.loadSnapshot(auth, options.spreadsheetId, year);
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
