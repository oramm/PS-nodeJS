/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import {
    buildInvoiceSummaryMatrix,
    buildSummarySheetFileName,
    buildSummarySheetNamePrefix,
    HEADER_ROW_INDEX,
    SETTLEMENT_LABEL_ROW_INDEX,
    SETTLEMENT_VALUE_ROW_INDEX,
    SHEET_LEVELS,
} from '../InvoiceSummarySheetBuilder';

const CONTRACT = {
    id: 7,
    ourId: 'U/1/2026',
    alias: 'Wodociągi',
    name: 'Budowa sieci',
};

const SETTLEMENT = {
    value: 969000,
    totalIssuedValue: 11440.44,
    remainingIssuedValue: 957559.56,
    totalRegisteredValue: 11440.44,
    remainingRegisteredValue: 957559.56,
};

const CONTEXT = {
    generatedAt: new Date(2026, 6, 31, 14, 22),
    settlement: SETTLEMENT,
};

function makeInvoice(overrides: any = {}) {
    return {
        id: 1,
        number: 'FV 1/2026',
        status: 'Wysłana',
        issueDate: '2026-01-15',
        sentDate: '2026-01-16',
        paymentDeadline: '2026-02-15',
        description: 'Uwaga do faktury',
        _entity: { id: 5, name: 'Gmina Miasto' },
        ...overrides,
    } as any;
}

function makeItem(overrides: any = {}) {
    return {
        id: 10,
        _parent: { id: 1 },
        parentId: 1,
        description: 'Etap I',
        quantity: 2,
        unitPrice: 1000.5,
        ...overrides,
    } as any;
}

describe('buildInvoiceSummaryMatrix', () => {
    it('składa nagłówek, wiersz faktury, jej pozycje i sumę', () => {
        const matrix = buildInvoiceSummaryMatrix(
            CONTRACT,
            [makeInvoice()],
            new Map([[1, [makeItem()]]]),
            CONTEXT
        );

        expect(matrix.values[0][0]).toBe(
            'Podsumowanie faktur - U/1/2026 | Wodociągi | Budowa sieci'
        );
        expect(matrix.values[1][0]).toBe('Wygenerowano: 2026-07-31 14:22');
        expect(matrix.values[HEADER_ROW_INDEX][0]).toBe('Numer / poz.');
        expect(matrix.values[HEADER_ROW_INDEX]).not.toContain('Kontrahent');
        expect(matrix.colCount).toBe(9);

        const invoiceRow = matrix.values[HEADER_ROW_INDEX + 1];
        expect(invoiceRow[0]).toBe('FV 1/2026');
        expect(invoiceRow[1]).toBe('2026-01-15');
        expect(invoiceRow[2]).toBe('Wysłana');
        expect(invoiceRow[7]).toBe(2001);
        expect(invoiceRow[8]).toBe('Uwaga do faktury');

        const itemRow = matrix.values[HEADER_ROW_INDEX + 2];
        expect(itemRow[0].trim()).toBe('1.');
        expect(itemRow[5]).toBe(2);
        expect(itemRow[6]).toBe(1000.5);
        expect(itemRow[7]).toBe(2001);
        expect(itemRow[8]).toBe('Etap I');

        const totalRow = matrix.values[matrix.values.length - 1];
        expect(totalRow[0]).toBe('RAZEM');
        expect(totalRow[7]).toBe(2001);
    });

    it('wypisuje kafelki rozliczenia kontraktu nad tabelą', () => {
        const matrix = buildInvoiceSummaryMatrix(
            CONTRACT,
            [makeInvoice()],
            new Map([[1, [makeItem()]]]),
            CONTEXT
        );

        // Blok zaczyna się od kolumny B - kolumna A zostaje pusta.
        expect(matrix.values[SETTLEMENT_LABEL_ROW_INDEX]).toEqual([
            '',
            'Wartość netto, zł',
            'Rozliczono, zł (faktury wysłane)',
            'Do rozliczenia, zł',
            'Zarejestrowano, zł (faktury zarejestrowane)',
            'Do zarejestrowania, zł',
        ]);
        expect(matrix.values[SETTLEMENT_VALUE_ROW_INDEX]).toEqual([
            '',
            969000,
            11440.44,
            957559.56,
            11440.44,
            957559.56,
        ]);
    });

    it('brak danych rozliczenia zostawia puste komórki, nie zera', () => {
        const matrix = buildInvoiceSummaryMatrix(CONTRACT, [], new Map(), {
            generatedAt: CONTEXT.generatedAt,
        });

        expect(matrix.values[SETTLEMENT_VALUE_ROW_INDEX]).toEqual([
            '',
            '',
            '',
            '',
            '',
            '',
        ]);
    });

    it('nazwa pliku niesie numer kontraktu i datę, bez ukośników', () => {
        expect(
            buildSummarySheetFileName(CONTRACT, CONTEXT.generatedAt)
        ).toBe('Podsumowanie faktur - U_1_2026 - 2026-07-31');
    });

    it('prefiks nazwy jest niezależny od daty i domknięty separatorem', () => {
        const prefix = buildSummarySheetNamePrefix(CONTRACT);

        expect(prefix).toBe('Podsumowanie faktur - U_1_2026 - ');
        // Po tym prefiksie Controller odnajduje arkusz kontraktu niezależnie od daty.
        expect(
            buildSummarySheetFileName(CONTRACT, new Date(2027, 0, 2))
        ).toBe(`${prefix}2027-01-02`);
        // Separator na końcu chroni przed trafieniem w arkusz kontraktu o dłuższym numerze.
        expect(
            buildSummarySheetNamePrefix({ ourId: 'U/1/2026A' })
        ).not.toBe(prefix);
    });

    it('grupuje pozycje pod fakturą i nadaje poziomy', () => {
        const matrix = buildInvoiceSummaryMatrix(
            CONTRACT,
            [makeInvoice(), makeInvoice({ id: 2, number: 'FV 2/2026' })],
            new Map([
                [1, [makeItem(), makeItem({ id: 11 })]],
                [2, [makeItem({ id: 12, _parent: { id: 2 }, parentId: 2 })]],
            ]),
            CONTEXT
        );

        const firstInvoiceRow = HEADER_ROW_INDEX + 1;
        expect(matrix.groups).toEqual([
            { startRow: firstInvoiceRow + 1, endRow: firstInvoiceRow + 3 },
            { startRow: firstInvoiceRow + 4, endRow: firstInvoiceRow + 5 },
        ]);
        expect(matrix.levelRuns).toEqual([
            {
                level: SHEET_LEVELS.INVOICE,
                startRow: firstInvoiceRow,
                endRow: firstInvoiceRow + 1,
            },
            {
                level: SHEET_LEVELS.ITEM,
                startRow: firstInvoiceRow + 1,
                endRow: firstInvoiceRow + 3,
            },
            {
                level: SHEET_LEVELS.INVOICE,
                startRow: firstInvoiceRow + 3,
                endRow: firstInvoiceRow + 4,
            },
            {
                level: SHEET_LEVELS.ITEM,
                startRow: firstInvoiceRow + 4,
                endRow: firstInvoiceRow + 5,
            },
            {
                level: SHEET_LEVELS.TOTAL,
                startRow: firstInvoiceRow + 5,
                endRow: firstInvoiceRow + 6,
            },
        ]);
    });

    it('faktura bez pozycji nie tworzy pustej grupy i liczy się jako zero', () => {
        const matrix = buildInvoiceSummaryMatrix(
            CONTRACT,
            [makeInvoice()],
            new Map(),
            CONTEXT
        );

        expect(matrix.groups).toEqual([]);
        expect(matrix.values[HEADER_ROW_INDEX + 1][7]).toBe(0);
        expect(matrix.values[matrix.values.length - 1][7]).toBe(0);
    });

    it('kontrakt bez faktur kończy się informacją zamiast sumy', () => {
        const matrix = buildInvoiceSummaryMatrix(
            CONTRACT,
            [],
            new Map(),
            CONTEXT
        );

        expect(matrix.values[matrix.values.length - 1][0]).toBe(
            'Kontrakt nie ma jeszcze faktur'
        );
        expect(matrix.levelRuns).toEqual([]);
    });
});
