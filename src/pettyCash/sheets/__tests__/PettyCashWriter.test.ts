import PettyCashWriter, { SheetSnapshot } from '../PettyCashWriter';
import { PETTY_CASH_COL, PETTY_CASH_WIDTH } from '../pettyCashSheetConfig';
import PettyCashEntry from '../../PettyCashEntry';
import PostalDispatch from '../../postal/PostalDispatch';
import PostalDispatchItem from '../../postal/PostalDispatchItem';

const SHEET_ID = 166741251;

/**
 * Migawka odwzorowuje ksztalt zakladki `zaliczki 2026`: naglowek, wiersz zbiorczy
 * miesiaca z formula sumy, wiersze danych z formula wydatku, wolne wiersze na koncu
 * zakresu. Dwa miesiace, zeby sprawdzic wybor wlasciwego bloku.
 *
 *  1  naglowek
 *  2  zbiorczy lipiec   =SUM(B3:B5)
 *  3  dane
 *  4  dane
 *  5  wolny
 *  6  zbiorczy sierpien =SUM(B7:B9)
 *  7  dane (faktura F00005G012600999273P)
 *  8  wolny
 *  9  wolny
 */
function makeSnapshot(): SheetSnapshot {
    const rows: string[][] = Array.from({ length: 9 }, () =>
        Array.from({ length: PETTY_CASH_WIDTH }, () => '')
    );
    const set = (row: number, col: number, value: string) => {
        rows[row - 1][col] = value;
    };

    set(1, PETTY_CASH_COL.date, '2026');
    set(1, PETTY_CASH_COL.description, 'OPIS');

    set(2, PETTY_CASH_COL.date, String(PettyCashWriter.dateToSerial('2026-07-01')));
    set(2, PETTY_CASH_COL.inflow, '=SUM(B3:B5)');
    set(2, PETTY_CASH_COL.payer, 'POZOSTAŁO W PORTFELU');

    for (const row of [3, 4]) {
        set(row, PETTY_CASH_COL.date, String(PettyCashWriter.dateToSerial('2026-07-06')));
        set(row, PETTY_CASH_COL.description, 'paliwo');
        set(row, PETTY_CASH_COL.gross, '112,98');
        set(row, PETTY_CASH_COL.expense, `=E${row}+F${row}`);
        set(row, PETTY_CASH_COL.payer, 'karta Krzysiek');
    }

    set(6, PETTY_CASH_COL.date, String(PettyCashWriter.dateToSerial('2026-08-01')));
    set(6, PETTY_CASH_COL.inflow, '=SUM(B7:B9)');
    set(6, PETTY_CASH_COL.payer, 'POZOSTAŁO W PORTFELU');

    set(7, PETTY_CASH_COL.date, String(PettyCashWriter.dateToSerial('2026-08-04')));
    set(7, PETTY_CASH_COL.description, 'poczta - listy');
    set(7, PETTY_CASH_COL.expense, '=E7+F7');
    set(7, PETTY_CASH_COL.documentNumber, 'F00005G012600999273P');
    set(7, PETTY_CASH_COL.payer, 'got. Michał');

    return { tab: { title: 'zaliczki 2026', sheetId: SHEET_ID }, rows };
}

const cardEntry = (overrides: Partial<PettyCashEntry> = {}) =>
    new PettyCashEntry({
        entryKind: 'INVOICE',
        entryDate: '2026-08-12',
        description: 'paliwo do FORD OP8105L',
        netAmount: 91.85,
        grossAmount: 112.98,
        inflowAmount: 112.98,
        documentNumber: '178/F/365/26',
        payerLabel: 'karta Krzysiek',
        settlementMethod: 'CARD',
        ...overrides,
    });

const postalEntry = () =>
    new PettyCashEntry({
        entryKind: 'POSTAL',
        entryDate: '2026-08-12',
        description: 'poczta - listy',
        netAmount: 9.8,
        grossAmount: 9.8,
        documentNumber: 'F00014G082600999273P',
        payerLabel: 'got. Karolina',
        settlementMethod: 'CASH',
        _dispatch: new PostalDispatch({
            invoiceNumber: 'F00014G082600999273P',
            items: [
                new PostalDispatchItem({
                    itemIndex: 1,
                    trackingNumber: '559007734369539067',
                    addressee: 'ZWiK Strzelin',
                    amount: 9.8,
                }),
            ],
        }),
    });

describe('PettyCashWriter - daty arkusza', () => {
    it('zamienia date na numer seryjny arkusza', () => {
        expect(PettyCashWriter.dateToSerial('2026-01-01')).toBe(46023);
        expect(PettyCashWriter.dateToSerial('2026-08-12')).toBe(46246);
    });

    it('wraca z numeru seryjnego na miesiac', () => {
        expect(PettyCashWriter.serialToMonthKey(46023)).toBe('2026-01');
        expect(PettyCashWriter.serialToMonthKey(46246)).toBe('2026-08');
    });

    it('czyta miesiac takze z zapisu tekstowego uzywanego w arkuszu', () => {
        expect(PettyCashWriter.labelToMonthKey('sie 2026')).toBe('2026-08');
        expect(PettyCashWriter.labelToMonthKey('paź 2026')).toBe('2026-10');
        expect(PettyCashWriter.labelToMonthKey('cokolwiek')).toBeNull();
    });
});

describe('PettyCashWriter - rozpoznanie zakladki', () => {
    const titles = [
        'zaliczki 2026',
        'ZALICZKI 2025',
        'ZALICZKI 2020 ',
        'Rozliczenie zaliczek ',
    ];

    it('dopasowuje mimo roznej wielkosci liter i spacji na koncu', () => {
        expect(PettyCashWriter.matchTabTitle(titles, 2026)).toBe('zaliczki 2026');
        expect(PettyCashWriter.matchTabTitle(titles, 2025)).toBe('ZALICZKI 2025');
        expect(PettyCashWriter.matchTabTitle(titles, 2020)).toBe('ZALICZKI 2020 ');
    });

    it('nie zgaduje, gdy zakladki dla roku nie ma', () => {
        expect(PettyCashWriter.matchTabTitle(titles, 2027)).toBeNull();
    });
});

describe('PettyCashWriter - bloki miesiecy', () => {
    it('czyta zakres miesiaca z formuly sumy, nie z numerow wierszy', () => {
        const blocks = PettyCashWriter.parseMonthBlocks(makeSnapshot().rows);
        expect(blocks).toEqual([
            { monthKey: '2026-07', aggregateRow: 2, firstDataRow: 3, lastDataRow: 5 },
            { monthKey: '2026-08', aggregateRow: 6, firstDataRow: 7, lastDataRow: 9 },
        ]);
    });
});

describe('PettyCashWriter - wybor wiersza', () => {
    it('wskazuje pierwszy wolny wiersz wewnatrz biezacego miesiaca', () => {
        const plan = PettyCashWriter.plan(cardEntry(), makeSnapshot());
        expect(plan).toMatchObject({ action: 'write', targetRow: 8 });
    });

    it('trafia do wlasciwego miesiaca, gdy data wskazuje wczesniejszy blok', () => {
        const plan = PettyCashWriter.plan(
            cardEntry({ entryDate: '2026-07-20' }),
            makeSnapshot()
        );
        expect(plan).toMatchObject({ action: 'write', targetRow: 5 });
    });

    it('nigdy nie celuje w wiersz zbiorczy ani w wiersz zajety', () => {
        const plan = PettyCashWriter.plan(cardEntry(), makeSnapshot());
        if (plan.action !== 'write') throw new Error('oczekiwano zapisu');
        expect([2, 6]).not.toContain(plan.targetRow);
        expect([3, 4, 7]).not.toContain(plan.targetRow);
    });

    it('odmawia, gdy miesiac nie zostal jeszcze otwarty w arkuszu', () => {
        const plan = PettyCashWriter.plan(
            cardEntry({ entryDate: '2026-09-02' }),
            makeSnapshot()
        );
        expect(plan.action).toBe('blocked');
        expect((plan as any).reason).toContain('2026-09');
        expect((plan as any).reason).toContain('recznie');
    });

    it('poszerza miesiac, gdy nie ma juz w nim wolnego wiersza', () => {
        const snapshot = makeSnapshot();
        for (const row of [8, 9]) {
            snapshot.rows[row - 1][PETTY_CASH_COL.description] = 'zajete';
            snapshot.rows[row - 1][PETTY_CASH_COL.expense] = `=E${row}+F${row}`;
        }
        const plan = PettyCashWriter.plan(cardEntry(), snapshot);
        if (plan.action !== 'write') throw new Error(`oczekiwano zapisu, jest ${plan.action}`);

        // Wiersz wstawiamy WEWNATRZ zakresu (przed ostatnim), zeby suma miesiaca go objela.
        const insert = plan.requests.find((r: any) => r.insertDimension);
        expect(insert.insertDimension.range).toMatchObject({
            sheetId: SHEET_ID,
            dimension: 'ROWS',
            startIndex: 8,
            endIndex: 9,
        });
        expect(plan.targetRow).toBe(9);
    });

    it('uznaje wiersz z notatka w dalszej kolumnie za zajety', () => {
        const snapshot = makeSnapshot();
        snapshot.rows[7][PETTY_CASH_COL.note] = 'notatka Karoliny';
        const plan = PettyCashWriter.plan(cardEntry(), snapshot);
        expect(plan).toMatchObject({ action: 'write', targetRow: 9 });
    });
});

describe('PettyCashWriter - jednokrotnosc', () => {
    it('pomija wpis, ktory system juz dodal', () => {
        const entry = cardEntry();
        const snapshot = makeSnapshot();
        snapshot.rows[7][PETTY_CASH_COL.marker] = entry.sheetMarker();
        const plan = PettyCashWriter.plan(entry, snapshot);
        expect(plan).toMatchObject({ action: 'skip', existingRow: 8 });
    });

    it('pomija dokument wpisany wczesniej recznie', () => {
        const plan = PettyCashWriter.plan(
            cardEntry({ documentNumber: 'F00005G012600999273P' }),
            makeSnapshot()
        );
        expect(plan).toMatchObject({ action: 'skip', existingRow: 7 });
        expect((plan as any).reason).toContain('F00005G012600999273P');
    });

    it('nie myli dokumentow z innego miesiaca', () => {
        const plan = PettyCashWriter.plan(
            cardEntry({ entryDate: '2026-07-20', documentNumber: 'F00005G012600999273P' }),
            makeSnapshot()
        );
        expect(plan.action).toBe('write');
    });
});

describe('PettyCashWriter - ksztalt zadan', () => {
    const requestsFor = (entry: PettyCashEntry) => {
        const plan = PettyCashWriter.plan(entry, makeSnapshot());
        if (plan.action !== 'write') throw new Error(`oczekiwano zapisu, jest ${plan.action}`);
        return plan;
    };

    it('kopiuje format z kanonicznego wiersza danych, a nie z pustego', () => {
        const plan = requestsFor(cardEntry());
        expect(plan.formatSourceRow).toBe(7);
        expect(plan.requests[0].copyPaste).toMatchObject({
            pasteType: 'PASTE_FORMAT',
            source: { sheetId: SHEET_ID, startRowIndex: 6, endRowIndex: 7 },
            destination: { sheetId: SHEET_ID, startRowIndex: 7, endRowIndex: 8 },
        });
    });

    it('zapisuje wylacznie wartosci, wiec formatowanie zostaje nietkniete', () => {
        const update = requestsFor(cardEntry()).requests[1].updateCells;
        expect(update.fields).toBe('userEnteredValue');
        expect(update.start).toEqual({ sheetId: SHEET_ID, rowIndex: 7, columnIndex: 0 });
        expect(update.rows[0].values).toHaveLength(PETTY_CASH_WIDTH);
    });

    it('wydatek jest formula, tak jak w wierszach wpisanych recznie', () => {
        const values = requestsFor(cardEntry()).requests[1].updateCells.rows[0].values;
        expect(values[PETTY_CASH_COL.expense]).toEqual({
            userEnteredValue: { formulaValue: '=E8+F8' },
        });
    });

    it('karta: kolumna wplywu lustrzana do wydatku', () => {
        const values = requestsFor(cardEntry()).requests[1].updateCells.rows[0].values;
        expect(values[PETTY_CASH_COL.inflow]).toEqual({
            userEnteredValue: { formulaValue: '=G8' },
        });
    });

    it('gotowka: kolumna wplywu pusta', () => {
        const values = requestsFor(postalEntry()).requests[1].updateCells.rows[0].values;
        expect(values[PETTY_CASH_COL.inflow]).toEqual({});
    });

    it('wyplata zaliczki: kwota wprost w kolumnie wplywu, bez kwot wydatku', () => {
        const advance = new PettyCashEntry({
            entryKind: 'ADVANCE',
            entryDate: '2026-08-12',
            description: 'zaliczka',
            inflowAmount: 2000,
            payerLabel: 'got. Michał',
            settlementMethod: 'ADVANCE',
        });
        const values = requestsFor(advance).requests[1].updateCells.rows[0].values;
        expect(values[PETTY_CASH_COL.inflow]).toEqual({
            userEnteredValue: { numberValue: 2000 },
        });
        expect(values[PETTY_CASH_COL.gross]).toEqual({});
        expect(values[PETTY_CASH_COL.noDocument]).toEqual({});
        expect(values[PETTY_CASH_COL.expense]).toEqual({
            userEnteredValue: { formulaValue: '=E8+F8' },
        });
    });

    it('wydatek bez dokumentu: kwota tylko w kolumnie BEZ FV', () => {
        const noDoc = new PettyCashEntry({
            entryKind: 'NO_DOCUMENT',
            entryDate: '2026-08-12',
            description: 'p.Irena 7/2026',
            noDocumentAmount: 500,
            payerLabel: 'got. ADOR',
            settlementMethod: 'CASH',
        });
        const values = requestsFor(noDoc).requests[1].updateCells.rows[0].values;
        expect(values[PETTY_CASH_COL.noDocument]).toEqual({
            userEnteredValue: { numberValue: 500 },
        });
        expect(values[PETTY_CASH_COL.net]).toEqual({});
        expect(values[PETTY_CASH_COL.gross]).toEqual({});
    });

    it('data trafia jako liczba seryjna, a nie jako tekst', () => {
        const values = requestsFor(cardEntry()).requests[1].updateCells.rows[0].values;
        expect(values[PETTY_CASH_COL.date]).toEqual({
            userEnteredValue: { numberValue: 46246 },
        });
    });

    it('znacznik robota ladzie w ukrytej kolumnie N', () => {
        const entry = cardEntry();
        const values = requestsFor(entry).requests[1].updateCells.rows[0].values;
        expect(values[PETTY_CASH_COL.marker]).toEqual({
            userEnteredValue: { stringValue: entry.sheetMarker() },
        });
    });
});

describe('PettyCashWriter - awaryjne poszerzenie miesiaca', () => {
    it('wstawia wiersz wewnatrz zakresu, zeby suma miesiaca objela nowy wiersz', () => {
        const block = {
            monthKey: '2026-08',
            aggregateRow: 6,
            firstDataRow: 7,
            lastDataRow: 9,
        };
        expect(PettyCashWriter.buildRangeExpansion(SHEET_ID, block)).toEqual({
            insertDimension: {
                range: {
                    sheetId: SHEET_ID,
                    dimension: 'ROWS',
                    startIndex: 8,
                    endIndex: 9,
                },
                inheritFromBefore: true,
            },
        });
    });
});

describe('PettyCashWriter - wpis niespojny', () => {
    it('nie planuje niczego, gdy wpis lamie regule rozliczenia', () => {
        const plan = PettyCashWriter.plan(
            cardEntry({ inflowAmount: 10 }),
            makeSnapshot()
        );
        expect(plan.action).toBe('blocked');
        expect((plan as any).reason).toContain('rowna wydatkowi');
    });
});
