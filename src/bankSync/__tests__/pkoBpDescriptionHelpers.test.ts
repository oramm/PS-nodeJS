import {
    extractCounterpartyAccount,
    extractCounterpartyName,
    extractNip,
    extractTitle,
    extractInvoiceNumbers,
} from '../parsers/pkoBpDescriptionHelpers';

describe('pkoBpDescriptionHelpers', () => {
    const sampleDesc =
        'Rachunek odbiorcy : 73116022020000000658944255 ' +
        'Nazwa odbiorcy :  JOANNA ŁĘŻAJ ' +
        'Tytuł :  FV 6/UR/4/2026';

    test('extractCounterpartyAccount - odbiorcy', () => {
        expect(extractCounterpartyAccount(sampleDesc)).toBe('73116022020000000658944255');
    });

    test('extractCounterpartyAccount - nadawcy', () => {
        const desc = 'Rachunek nadawcy : 48102036680000550206787115';
        expect(extractCounterpartyAccount(desc)).toBe('48102036680000550206787115');
    });

    test('extractCounterpartyAccount - not present', () => {
        expect(extractCounterpartyAccount('Opłata bankowa')).toBeNull();
    });

    test('extractCounterpartyName', () => {
        expect(extractCounterpartyName(sampleDesc)).toBe('JOANNA ŁĘŻAJ');
    });

    test('extractNip', () => {
        const desc = 'Identyfikator odbiorcy : 1234567890';
        expect(extractNip(desc)).toBe('1234567890');
    });

    test('extractNip - not present', () => {
        expect(extractNip(sampleDesc)).toBeNull();
    });

    test('extractTitle', () => {
        expect(extractTitle(sampleDesc)).toBe('FV 6/UR/4/2026');
    });

    describe('extractInvoiceNumbers', () => {
        test('FV 6/UR/4/2026 from Tytuł', () => {
            const nums = extractInvoiceNumbers(sampleDesc);
            expect(nums.some((n) => /6.*UR.*4.*2026/i.test(n))).toBe(true);
        });

        test('structured Numer faktury VAT field', () => {
            const desc =
                'Numer faktury VAT lub okres płatności zbiorczej :  72/2026  Tytuł :  zapłata';
            const nums = extractInvoiceNumbers(desc);
            expect(nums).toContain('72/2026');
        });

        test('FV 18/2026 from Tytuł', () => {
            const desc = 'Tytuł :  FV 18/2026';
            const nums = extractInvoiceNumbers(desc);
            expect(nums.some((n) => n.includes('18/2026'))).toBe(true);
        });

        test('multiple invoice numbers in one description', () => {
            const desc = 'Tytuł :  FV 1/2026 FV 2/2026';
            const nums = extractInvoiceNumbers(desc);
            expect(nums.length).toBeGreaterThanOrEqual(2);
        });

        test('no invoice numbers', () => {
            const desc = 'Opłata za prowadzenie rachunku';
            const nums = extractInvoiceNumbers(desc);
            expect(nums).toHaveLength(0);
        });
    });
});
