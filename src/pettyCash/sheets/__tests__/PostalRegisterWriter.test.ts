import PostalRegisterWriter, { RegisterSnapshot } from '../PostalRegisterWriter';
import { POSTAL_COL, POSTAL_WIDTH } from '../postalRegisterConfig';
import { dateToSerial } from '../sheetDates';
import PettyCashEntry from '../../PettyCashEntry';
import PostalDispatch from '../../postal/PostalDispatch';
import PostalDispatchItem from '../../postal/PostalDispatchItem';

const SHEET_ID = 155183121;

/** Prawdziwe numery nadania — wymyślone nie przeszłyby cyfry kontrolnej SSCC. */
const TRACKING = [
    '559007734369539067',
    '559007734369539074',
    '559007734369539050',
    '559007734369539081',
    '559007734369539432',
    '559007734369539425',
];

/**
 * Migawka odwzorowuje końcówkę zakładki `poczta wych. 2026`:
 *
 *  1  wiersz tytułowy
 *  2  blok 80: nagłówek       (A=80, B=faktura, E/F/G=etykiety)
 *  3          pozycja
 *  4          suma            (G==SUM(G3), H=płacący)
 *  5  separator
 *  6  blok 81: nagłówek
 *  7          pozycja
 *  8          suma
 *  9  separator  → nowy blok zaczyna się w wierszu 10
 */
function makeSnapshot(): RegisterSnapshot {
    // Kilka pustych wierszy zapasu pod ostatnim blokiem — jak w żywej zakładce,
    // gdzie pod rejestrem stoi jeszcze książka adresowa.
    const rows: string[][] = Array.from({ length: 16 }, () =>
        Array.from({ length: POSTAL_WIDTH }, () => '')
    );
    const set = (row: number, col: number, value: string) => {
        rows[row - 1][col] = value;
    };

    set(1, POSTAL_COL.blockNumber, 'zestawienie listów');

    const block = (headerRow: number, number: number, invoice: string, tracking: string) => {
        set(headerRow, POSTAL_COL.blockNumber, String(number));
        set(headerRow, POSTAL_COL.itemIndex, invoice);
        set(headerRow, POSTAL_COL.tracking, 'nr listu');
        set(headerRow, POSTAL_COL.date, 'data ');
        set(headerRow, POSTAL_COL.amount, 'kwota ');

        set(headerRow + 1, POSTAL_COL.itemIndex, '1');
        set(headerRow + 1, POSTAL_COL.addressee, 'PWIK we Wrześni');
        set(headerRow + 1, POSTAL_COL.tracking, `(00)${tracking}`);
        set(headerRow + 1, POSTAL_COL.date, String(dateToSerial('2026-08-04')));
        set(headerRow + 1, POSTAL_COL.amount, '10.3');

        set(headerRow + 2, POSTAL_COL.amount, `=SUM(G${headerRow + 1})`);
        set(headerRow + 2, POSTAL_COL.payer, 'got. Michał');
    };

    block(2, 80, 'F00005G082600999273P', TRACKING[0]);
    block(6, 81, 'F00014G082600999273P', TRACKING[1]);

    return { tab: { title: 'poczta wych. 2026', sheetId: SHEET_ID }, rows };
}

const dispatchEntry = (itemCount: number, invoice = 'F00021G082600999273P') => {
    const items = Array.from({ length: itemCount }, (_, index) => {
        const item = new PostalDispatchItem({
            itemIndex: index + 1,
            trackingNumber: TRACKING[index],
            addressee: `Adresat ${index + 1}`,
            contentsDescription: `pismo ${index + 1}`,
            amount: 9.8,
        });
        return item;
    });
    const gross = Math.round(items.length * 9.8 * 100) / 100;
    return new PettyCashEntry({
        entryKind: 'POSTAL',
        entryDate: '2026-08-12',
        description: 'poczta - listy',
        netAmount: gross,
        grossAmount: gross,
        documentNumber: invoice,
        payerLabel: 'got. Karolina',
        settlementMethod: 'CASH',
        _dispatch: new PostalDispatch({ invoiceNumber: invoice, items }),
    });
};

const planFor = (entry: PettyCashEntry, snapshot = makeSnapshot()) => {
    const plan = PostalRegisterWriter.plan(entry, snapshot);
    if (plan.action !== 'write') throw new Error(`oczekiwano zapisu, jest ${plan.action}`);
    return plan;
};

describe('PostalRegisterWriter — rozpoznanie zakładki', () => {
    const titles = ['poczta wych. 2026', 'Poczta wych. 2025', 'Arkusz13', 'Rozliczenie zaliczek '];

    it('dopasowuje mimo różnej wielkości liter', () => {
        expect(PostalRegisterWriter.matchTabTitle(titles, 2026)).toBe('poczta wych. 2026');
        expect(PostalRegisterWriter.matchTabTitle(titles, 2025)).toBe('Poczta wych. 2025');
    });

    it('nie zgaduje, gdy zakładki dla roku nie ma', () => {
        expect(PostalRegisterWriter.matchTabTitle(titles, 2027)).toBeNull();
    });
});

describe('PostalRegisterWriter — ostatni blok', () => {
    it('znajduje blok o najwyższym numerze wraz z jego wierszem sumy', () => {
        expect(PostalRegisterWriter.findLastBlock(makeSnapshot().rows)).toEqual({
            blockNumber: 81,
            headerRow: 6,
            firstItemRow: 7,
            lastItemRow: 7,
            sumRow: 8,
        });
    });

    it('przepisuje etykiety kolumn z nagłówka znak w znak, razem ze spacjami na końcu', () => {
        expect(PostalRegisterWriter.readHeaderLabels(makeSnapshot().rows, 6)).toEqual({
            tracking: 'nr listu',
            date: 'data ',
            amount: 'kwota ',
        });
    });
});

describe('PostalRegisterWriter — umiejscowienie bloku', () => {
    it('zaczyna dwa wiersze pod sumą poprzedniego bloku i numeruje o jeden wyżej', () => {
        const plan = planFor(dispatchEntry(2));
        expect(plan).toMatchObject({
            blockNumber: 82,
            headerRow: 10,
            firstItemRow: 11,
            sumRow: 13,
        });
    });

    it('robi sobie miejsce, zamiast wpisywać się w istniejące wiersze', () => {
        // Wiersz 11 zajęty cudzymi danymi (jak książka adresowa pod rejestrem) —
        // wstawienie ma go zepchnąć w dół, a nie zablokować zapis ani go nadpisać.
        const snapshot = makeSnapshot();
        snapshot.rows[10][POSTAL_COL.addressee] = 'ZGK Jelcz Laskowice';

        const plan = PostalRegisterWriter.plan(dispatchEntry(2), snapshot);
        expect(plan.action).toBe('write');

        const insert = (plan as any).requests.find((r: any) => r.insertDimension);
        expect(insert.insertDimension.range).toMatchObject({
            sheetId: SHEET_ID,
            dimension: 'ROWS',
            startIndex: 9,
            endIndex: 13,
        });
    });

    it('wstawia dokładnie tyle wierszy, ile zajmie blok', () => {
        const rowsInserted = (itemCount: number) => {
            const insert = planFor(dispatchEntry(itemCount)).requests.find(
                (r: any) => r.insertDimension
            );
            return (
                insert.insertDimension.range.endIndex - insert.insertDimension.range.startIndex
            );
        };
        expect(rowsInserted(1)).toBe(3); // nagłówek + 1 pozycja + suma
        expect(rowsInserted(4)).toBe(6);
    });

    it('odmawia, gdy faktura ma już blok w rejestrze', () => {
        const plan = PostalRegisterWriter.plan(
            dispatchEntry(1, 'F00014G082600999273P'),
            makeSnapshot()
        );
        expect(plan).toMatchObject({ action: 'skip', existingRow: 6 });
    });

    it('odmawia dla wpisu, który nie jest wysyłką pocztową', () => {
        const notPostal = new PettyCashEntry({
            entryKind: 'INVOICE',
            entryDate: '2026-08-12',
            description: 'paliwo',
            netAmount: 91.85,
            grossAmount: 112.98,
            inflowAmount: 112.98,
            documentNumber: '178/F/365/26',
            payerLabel: 'karta Krzysiek',
            settlementMethod: 'CARD',
        });
        const plan = PostalRegisterWriter.plan(notPostal, makeSnapshot());
        expect(plan.action).toBe('blocked');
        expect((plan as any).reason).toContain('nie jest wysylka');
    });
});

describe('PostalRegisterWriter — zawartość bloku', () => {
    const valuesOf = (entry: PettyCashEntry) =>
        planFor(entry)
            .requests.find((r: any) => r.updateCells)
            .updateCells.rows.map((row: any) => row.values);

    it('nagłówek niesie numer bloku, numer faktury, etykiety i znacznik robota', () => {
        const entry = dispatchEntry(2);
        const header = valuesOf(entry)[0];
        expect(header[POSTAL_COL.blockNumber]).toEqual({ userEnteredValue: { numberValue: 82 } });
        expect(header[POSTAL_COL.itemIndex]).toEqual({
            userEnteredValue: { stringValue: 'F00021G082600999273P' },
        });
        expect(header[POSTAL_COL.tracking]).toEqual({
            userEnteredValue: { stringValue: 'nr listu' },
        });
        expect(header[POSTAL_COL.marker]).toEqual({
            userEnteredValue: { stringValue: entry._dispatch!.sheetMarker() },
        });
    });

    it('data stoi tylko w pierwszym wierszu pozycji — resztę kryje scalenie', () => {
        const rows = valuesOf(dispatchEntry(3));
        expect(rows[1][POSTAL_COL.date]).toEqual({
            userEnteredValue: { numberValue: dateToSerial('2026-08-12') },
        });
        expect(rows[2][POSTAL_COL.date]).toEqual({});
        expect(rows[3][POSTAL_COL.date]).toEqual({});
    });

    it('numer nadania zapisuje się w postaci arkuszowej', () => {
        const rows = valuesOf(dispatchEntry(1));
        expect(rows[1][POSTAL_COL.tracking]).toEqual({
            userEnteredValue: { stringValue: `(00)${TRACKING[0]}` },
        });
    });

    it('wiersz sumy niesie formułę oraz sposób płatności razem z osobą', () => {
        const rows = valuesOf(dispatchEntry(2));
        const sum = rows[rows.length - 1];
        expect(sum[POSTAL_COL.amount]).toEqual({
            userEnteredValue: { formulaValue: '=SUM(G11:G12)' },
        });
        // W arkuszu sposób płatności i osoba stoją w jednej komórce — bez tego wiersz
        // robota różniłby się od ludzkiego na pierwszy rzut oka.
        expect(sum[POSTAL_COL.payer]).toEqual({
            userEnteredValue: { stringValue: 'got. Karolina' },
        });
    });

    it('blok jednopozycyjny używa sumy bez zakresu, tak jak wpisują to ludzie', () => {
        expect(PostalRegisterWriter.buildSumFormula(11, 11)).toBe('=SUM(G11)');
        expect(PostalRegisterWriter.buildSumFormula(11, 14)).toBe('=SUM(G11:G14)');
    });
});

describe('PostalRegisterWriter — formatowanie i scalenia', () => {
    const requestsOf = (itemCount: number) => planFor(dispatchEntry(itemCount)).requests;
    const kinds = (requests: any[]) => requests.map((r) => Object.keys(r)[0]);

    it('kopiuje format osobno dla nagłówka, pozycji i sumy', () => {
        const requests = requestsOf(3);
        const copies = requests.filter((r) => r.copyPaste).map((r) => r.copyPaste);
        expect(copies).toHaveLength(3);
        expect(copies[0].source.startRowIndex).toBe(5); // nagłówek bloku 81
        expect(copies[1].source.startRowIndex).toBe(6); // pierwsza pozycja bloku 81
        expect(copies[1].destination.endRowIndex - copies[1].destination.startRowIndex).toBe(3);
        expect(copies[2].source.startRowIndex).toBe(7); // suma bloku 81
        expect(copies.every((c) => c.pasteType === 'PASTE_FORMAT')).toBe(true);
    });

    it('czyści scalenia przed założeniem własnych', () => {
        const requests = requestsOf(2);
        expect(kinds(requests).indexOf('unmergeCells')).toBeLessThan(
            kinds(requests).indexOf('mergeCells')
        );
    });

    it('scala kolumnę numeru bloku przez cały blok i numer faktury przez B:D', () => {
        const merges = requestsOf(2)
            .filter((r) => r.mergeCells)
            .map((r) => r.mergeCells.range);
        expect(merges[0]).toMatchObject({
            startRowIndex: 9,
            endRowIndex: 13,
            startColumnIndex: POSTAL_COL.blockNumber,
            endColumnIndex: POSTAL_COL.blockNumber + 1,
        });
        expect(merges[1]).toMatchObject({
            startRowIndex: 9,
            endRowIndex: 10,
            startColumnIndex: POSTAL_COL.itemIndex,
            endColumnIndex: POSTAL_COL.contents + 1,
        });
    });

    it('scala datę tylko wtedy, gdy listów jest więcej niż jeden', () => {
        const dateMerge = (itemCount: number) =>
            requestsOf(itemCount)
                .filter((r) => r.mergeCells)
                .map((r) => r.mergeCells.range)
                .find((range: any) => range.startColumnIndex === POSTAL_COL.date);

        expect(dateMerge(1)).toBeUndefined();
        expect(dateMerge(3)).toMatchObject({ startRowIndex: 10, endRowIndex: 13 });
    });

    it('zapisuje wyłącznie wartości, więc formatowanie zostaje nietknięte', () => {
        const update = requestsOf(2).find((r: any) => r.updateCells).updateCells;
        expect(update.fields).toBe('userEnteredValue');
        expect(update.start).toEqual({ sheetId: SHEET_ID, rowIndex: 9, columnIndex: 0 });
        expect(update.rows).toHaveLength(4);
    });
});

describe('PostalRegisterWriter — link do śledzenia', () => {
    const TEMPLATE = 'https://example.test/sledz?numer={number}';

    const trackingCellOf = (template: string) => {
        const plan = PostalRegisterWriter.plan(dispatchEntry(1), makeSnapshot(), template);
        if (plan.action !== 'write') throw new Error('oczekiwano zapisu');
        const rows = plan.requests.find((r: any) => r.updateCells).updateCells.rows;
        return rows[1].values[POSTAL_COL.tracking];
    };

    it('bez szablonu numer zostaje zwykłym tekstem', () => {
        expect(trackingCellOf('')).toEqual({
            userEnteredValue: { stringValue: `(00)${TRACKING[0]}` },
        });
    });

    it('z szablonem numer staje się odnośnikiem, ale wyświetla się tak samo', () => {
        expect(trackingCellOf(TEMPLATE)).toEqual({
            userEnteredValue: {
                formulaValue:
                    `=HYPERLINK("https://example.test/sledz?numer=00${TRACKING[0]}";` +
                    `"(00)${TRACKING[0]}")`,
            },
        });
    });

    it('wyszukiwarka Poczty dostaje 20 znaków bez nawiasów', () => {
        expect(PostalDispatchItem.formatTrackingNumberForSearch(TRACKING[0])).toBe(
            `00${TRACKING[0]}`
        );
        expect(
            PostalDispatchItem.buildTrackingUrl(TEMPLATE, TRACKING[0])
        ).toBe(`https://example.test/sledz?numer=00${TRACKING[0]}`);
        expect(PostalDispatchItem.buildTrackingUrl('bez zmiennej', TRACKING[0])).toBeNull();
    });

    it('odczyt komórki z odnośnikiem zwraca numer, a nie formułę', () => {
        const rows = makeSnapshot().rows;
        rows[6][POSTAL_COL.tracking] =
            `=HYPERLINK("https://example.test/sledz?numer=00${TRACKING[0]}";"(00)${TRACKING[0]}")`;
        expect(PostalRegisterWriter.readTrackingCell(rows, 7)).toBe(`(00)${TRACKING[0]}`);
        expect(
            PostalDispatchItem.normalizeTrackingNumber(
                PostalRegisterWriter.readTrackingCell(rows, 7)
            )
        ).toBe(TRACKING[0]);
    });
});
