import PettyCashEntry from '../PettyCashEntry';
import PostalDispatch from '../postal/PostalDispatch';
import PostalDispatchItem from '../postal/PostalDispatchItem';

/**
 * Prawdziwe numery nadania z bloku 1 rejestru listow 2026 (faktura
 * F00005G012600999273P). Uzywamy realnych numerow, bo wymyslone nie przeszlyby
 * cyfry kontrolnej SSCC.
 */
const TRACKING = [
    '559007734369539067',
    '559007734369539074',
    '559007734369539050',
    '559007734369539081',
];

function cardPurchase(overrides: Partial<PettyCashEntry> = {}) {
    return new PettyCashEntry({
        entryKind: 'INVOICE',
        entryDate: '2026-01-12',
        description: 'paliwo do FORD OP8105L',
        netAmount: 91.85,
        grossAmount: 112.98,
        inflowAmount: 112.98,
        documentNumber: '178/F/365/26',
        payerLabel: 'karta Krzysiek',
        settlementMethod: 'CARD',
        ...overrides,
    });
}

const letter = (index: number, amount: number, addressee = 'ZWiK Strzelin') =>
    new PostalDispatchItem({
        itemIndex: index + 1,
        trackingNumber: TRACKING[index],
        addressee,
        amount,
    });

function postalEntry(items: PostalDispatchItem[], gross = 39.7) {
    return new PettyCashEntry({
        entryKind: 'POSTAL',
        entryDate: '2026-01-07',
        description: 'poczta - listy',
        netAmount: gross,
        grossAmount: gross,
        documentNumber: 'F00005G012600999273P',
        payerLabel: 'got. Karolina',
        settlementMethod: 'CASH',
        _dispatch: new PostalDispatch({
            invoiceNumber: 'F00005G012600999273P',
            items,
        }),
    });
}

describe('PettyCashEntry - kwota wydatku', () => {
    it('liczy wydatek jako brutto + kwota bez dokumentu (odpowiednik formuly =E+F)', () => {
        expect(cardPurchase().expenseAmount).toBe(112.98);
        expect(
            new PettyCashEntry({ entryKind: 'NO_DOCUMENT', noDocumentAmount: 500 })
                .expenseAmount
        ).toBe(500);
    });

    it('wyplata zaliczki ma wydatek zero mimo kwoty wplywu', () => {
        const advance = new PettyCashEntry({
            entryKind: 'ADVANCE',
            inflowAmount: 2000,
            settlementMethod: 'ADVANCE',
        });
        expect(advance.expenseAmount).toBe(0);
    });
});

describe('PettyCashEntry - regula rozliczenia (saldo portfela)', () => {
    it('karta wypelnia kolumne wplywu kwota rowna wydatkowi', () => {
        expect(cardPurchase().expectedInflowAmount).toBe(112.98);
        expect(cardPurchase().consistencyErrors()).toEqual([]);
    });

    it('gotowka zostawia kolumne wplywu pusta', () => {
        const cash = cardPurchase({
            settlementMethod: 'CASH',
            inflowAmount: null,
            payerLabel: 'got. Michal',
        });
        expect(cash.expectedInflowAmount).toBeNull();
        expect(cash.consistencyErrors()).toEqual([]);
    });

    it('odrzuca wydatek gotowkowy z kwota w kolumnie wplywu', () => {
        const broken = cardPurchase({
            settlementMethod: 'CASH',
            inflowAmount: 112.98,
        });
        expect(broken.consistencyErrors()).toContainEqual(
            expect.stringContaining('nie moze miec kwoty w kolumnie wplywu')
        );
    });

    it('odrzuca wydatek kartowy z kwota wplywu inna niz wydatek', () => {
        expect(
            cardPurchase({ inflowAmount: 100 }).consistencyErrors()
        ).toContainEqual(expect.stringContaining('rowna wydatkowi'));
    });

    it('odrzuca wydatek kartowy bez kwoty wplywu', () => {
        expect(
            cardPurchase({ inflowAmount: null }).consistencyErrors()
        ).toContainEqual(expect.stringContaining('rowna wydatkowi'));
    });
});

describe('PettyCashEntry - kwoty wlasciwe dla rodzaju', () => {
    it('wpis pocztowy wymaga netto rownego brutto', () => {
        const entry = postalEntry([letter(0, 39.7)]);
        entry.netAmount = 32.28;
        expect(entry.consistencyErrors()).toContainEqual(
            expect.stringContaining('netto musi rownac sie brutto')
        );
    });

    it('faktura odrzuca netto wyzsze od brutto', () => {
        expect(cardPurchase({ netAmount: 200 }).consistencyErrors()).toContainEqual(
            expect.stringContaining('nie moze byc wyzsza od brutto')
        );
    });

    it('wydatek bez dokumentu nie moze miec netto ani brutto', () => {
        const entry = new PettyCashEntry({
            entryKind: 'NO_DOCUMENT',
            entryDate: '2026-01-20',
            description: 'p.Irena 12/2025',
            noDocumentAmount: 500,
            grossAmount: 500,
            payerLabel: 'got. ADOR',
            settlementMethod: 'CASH',
        });
        expect(entry.consistencyErrors()).toContainEqual(
            expect.stringContaining('nie moze miec kwoty netto ani brutto')
        );
    });

    it('wyplata zaliczki przechodzi tylko z rozliczeniem ADVANCE', () => {
        const advance = new PettyCashEntry({
            entryKind: 'ADVANCE',
            entryDate: '2026-01-20',
            description: 'zaliczka',
            inflowAmount: 2000,
            payerLabel: 'got. ADOR',
            settlementMethod: 'ADVANCE',
        });
        expect(advance.consistencyErrors()).toEqual([]);

        advance.settlementMethod = 'CASH';
        expect(advance.consistencyErrors()).toContainEqual(
            expect.stringContaining('musi miec rozliczenie typu ADVANCE')
        );
    });
});

describe('PettyCashEntry - powiazanie z wysylka pocztowa', () => {
    it('przechodzi, gdy suma listow rowna sie kwocie faktury', () => {
        const entry = postalEntry([
            letter(0, 9.8),
            letter(1, 9.8, 'PGKiM Ozimek'),
            letter(2, 9.8, 'Gmina Scinawa'),
            letter(3, 10.3, 'ZWiK Zielona Gora'),
        ]);
        expect(entry._dispatch?.itemsTotal).toBe(39.7);
        expect(entry.consistencyErrors()).toEqual([]);
    });

    it('wskazuje roznice, gdy suma listow nie zgadza sie z faktura', () => {
        const entry = postalEntry([letter(0, 9.8), letter(1, 9.8)], 39.7);
        expect(entry.consistencyErrors()).toContainEqual(
            expect.stringContaining('Roznica: -20.10')
        );
    });

    it('wpis pocztowy bez listy listow jest odrzucany', () => {
        const entry = postalEntry([letter(0, 39.7)]);
        entry._dispatch = undefined;
        expect(entry.consistencyErrors()).toContainEqual(
            expect.stringContaining('wymaga listy wyslanych listow')
        );
    });

    it('wpis niepocztowy nie moze miec listy listow', () => {
        const entry = cardPurchase({
            _dispatch: new PostalDispatch({
                invoiceNumber: 'F00005G012600999273P',
                items: [letter(0, 112.98)],
            }),
        });
        expect(entry.consistencyErrors()).toContainEqual(
            expect.stringContaining('Tylko wpis pocztowy')
        );
    });
});

describe('PettyCashEntry - etykieta placacego w arkuszu', () => {
    it('skleja sposob platnosci z osoba, tak jak w wierszach wpisanych recznie', () => {
        expect(cardPurchase({ payerLabel: 'Krzysiek' }).sheetPayerLabel).toBe(
            'karta Krzysiek'
        );
        expect(
            cardPurchase({
                settlementMethod: 'CASH',
                inflowAmount: null,
                payerLabel: 'Karolina',
            }).sheetPayerLabel
        ).toBe('got. Karolina');
    });

    it('nie dubluje przedrostka, gdy czlowiek wpisal go sam', () => {
        expect(cardPurchase({ payerLabel: 'karta Krzysiek' }).sheetPayerLabel).toBe(
            'karta Krzysiek'
        );
        expect(
            cardPurchase({
                settlementMethod: 'CASH',
                inflowAmount: null,
                payerLabel: 'got. Karolina',
            }).sheetPayerLabel
        ).toBe('got. Karolina');
    });

    it('poprawia przedrostek, gdy nie zgadza sie ze sposobem platnosci', () => {
        expect(cardPurchase({ payerLabel: 'got. Krzysiek' }).sheetPayerLabel).toBe(
            'karta Krzysiek'
        );
    });

    it('wyplata zaliczki idzie jako gotowka', () => {
        const advance = new PettyCashEntry({
            entryKind: 'ADVANCE',
            entryDate: '2026-08-12',
            description: 'zaliczka',
            inflowAmount: 2000,
            payerLabel: 'Michal',
            settlementMethod: 'ADVANCE',
        });
        expect(advance.sheetPayerLabel).toBe('got. Michal');
    });
});

describe('PettyCashEntry - znacznik i klucz tresci', () => {
    it('ten sam dokument daje ten sam znacznik', () => {
        expect(cardPurchase().sheetMarker()).toBe(cardPurchase().sheetMarker());
    });

    it('rozny opis daje rozny klucz - dwie wyplaty tego samego dnia na te sama kwote', () => {
        const base = {
            entryKind: 'NO_DOCUMENT' as const,
            entryDate: '2026-01-20',
            noDocumentAmount: 500,
            payerLabel: 'got. ADOR',
            settlementMethod: 'CASH' as const,
        };
        const irena = new PettyCashEntry({ ...base, description: 'p.Irena 12/2025' });
        const krzysiek = new PettyCashEntry({
            ...base,
            description: 'Krzysiek 12/2025',
        });
        expect(irena.contentKey()).not.toBe(krzysiek.contentKey());
    });
});

describe('PettyCashEntry - normalizacja wejscia', () => {
    it('przyjmuje daty w obu formatach spotykanych w arkuszu', () => {
        expect(PettyCashEntry.normalizeDate('2026/01/13')).toBe('2026-01-13');
        expect(PettyCashEntry.normalizeDate('2026-01-13')).toBe('2026-01-13');
        expect(PettyCashEntry.normalizeDate(new Date('2026-01-13T00:00:00Z'))).toBe(
            '2026-01-13'
        );
    });

    it('przyjmuje kwoty z przecinkiem', () => {
        expect(PettyCashEntry.parseAmountOrNull('112,98')).toBe(112.98);
        expect(PettyCashEntry.parseAmountOrNull('')).toBeNull();
        expect(PettyCashEntry.parseAmountOrNull(null)).toBeNull();
    });

    it('odrzuca date w zlym formacie', () => {
        expect(
            cardPurchase({ entryDate: '12.01.2026' }).consistencyErrors()
        ).toContainEqual(expect.stringContaining('YYYY-MM-DD'));
    });
});
