import {
    hasReceiptAnchors,
    normalizeFields,
    parseAmount,
} from '../ReceiptAnalyzer';

/**
 * Testujemy to, co decyduje bez udzialu modelu: kiedy w ogole warto go wolac
 * i czy jego odpowiedz nadaje sie do wlozenia w formularz.
 */

describe('hasReceiptAnchors - bramka przed wywolaniem modelu', () => {
    it('przepuszcza paragon fiskalny', () => {
        expect(
            hasReceiptAnchors('SKLEP ABC\nCHLEB 4,50\nSUMA PLN 4,50\nPARAGON FISKALNY')
        ).toBe(true);
    });

    it('przepuszcza fakture z kwotami netto i brutto', () => {
        expect(
            hasReceiptAnchors('Faktura VAT nr FV/1/2026\nNetto 100,00 Brutto 123,00')
        ).toBe(true);
    });

    it('odrzuca tekst bez kwoty - samo slowo "faktura" nie wystarcza', () => {
        expect(hasReceiptAnchors('Faktura zostanie wystawiona w przyszlym tygodniu')).toBe(
            false
        );
    });

    it('odrzuca kwote bez kontekstu pienieznego - to moze byc cokolwiek', () => {
        expect(hasReceiptAnchors('Pomiar 12,50 oraz 3,20 w punkcie kontrolnym')).toBe(false);
    });

    it('odrzuca smieci z nieudanego OCR', () => {
        expect(hasReceiptAnchors('||| ~~~ ,,, ...')).toBe(false);
        expect(hasReceiptAnchors('')).toBe(false);
    });
});

describe('parseAmount', () => {
    it('czyta kwote z przecinkiem, kropka i spacja tysiecy', () => {
        expect(parseAmount('123,45')).toBe(123.45);
        expect(parseAmount('123.45')).toBe(123.45);
        expect(parseAmount('1 234,56')).toBe(1234.56);
        expect(parseAmount(123.45)).toBe(123.45);
    });

    it('zdejmuje walute doklejona do liczby', () => {
        expect(parseAmount('4,50 PLN')).toBe(4.5);
        expect(parseAmount('4,50 zl')).toBe(4.5);
    });

    it('oddaje null zamiast zera, gdy wartosci nie ma albo jest bez sensu', () => {
        expect(parseAmount(null)).toBeNull();
        expect(parseAmount(undefined)).toBeNull();
        expect(parseAmount('')).toBeNull();
        expect(parseAmount('brak')).toBeNull();
        expect(parseAmount(0)).toBeNull();
        expect(parseAmount(-5)).toBeNull();
    });
});

describe('normalizeFields - odpowiedz modelu w postaci nadajacej sie do formularza', () => {
    it('przepisuje komplet pol', () => {
        expect(
            normalizeFields({ brutto: 123.0, netto: 100.0, numer: 'FV/2026/08/123' })
        ).toEqual({
            grossAmount: 123,
            netAmount: 100,
            documentNumber: 'FV/2026/08/123',
        });
    });

    it('paragon bez numeru zostaje bez numeru', () => {
        expect(normalizeFields({ brutto: 4.5, netto: null, numer: null })).toEqual({
            grossAmount: 4.5,
            netAmount: null,
            documentNumber: null,
        });
    });

    it('odrzuca netto wyzsze od brutto - model pomylil pola', () => {
        const fields = normalizeFields({ brutto: 100, netto: 123 });
        expect(fields.grossAmount).toBe(100);
        expect(fields.netAmount).toBeNull();
    });

    it('nie bierze kwoty wpisanej w pole numeru', () => {
        expect(normalizeFields({ brutto: 4.5, numer: '4,50' }).documentNumber).toBeNull();
    });

    it('pusta odpowiedz modelu daje same nulle, nie zera', () => {
        expect(normalizeFields({})).toEqual({
            grossAmount: null,
            netAmount: null,
            documentNumber: null,
        });
        expect(normalizeFields(null)).toEqual({
            grossAmount: null,
            netAmount: null,
            documentNumber: null,
        });
    });
});
