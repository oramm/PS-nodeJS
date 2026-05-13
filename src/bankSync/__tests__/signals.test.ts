import {
    invoiceNumberSignal,
    nipSignal,
    accountSignal,
    nameSimilarity,
    amountSignal,
    dateWindowSignal,
} from '../matching/signals';

// Setup.Bank uses process.env with defaults matching test expectations:
// amountToleranceGrosze=1, dateWindowDays=60 — no mock needed.

describe('invoiceNumberSignal', () => {
    test('exact match → 1', () => {
        expect(invoiceNumberSignal(['FV 6/UR/4/2026'], 'FV 6/UR/4/2026')).toBe(1);
    });
    test('no match → 0', () => {
        expect(invoiceNumberSignal(['FV 7/2026'], 'FV 6/UR/4/2026')).toBe(0);
    });
    test('empty arrays → 0', () => {
        expect(invoiceNumberSignal([], 'FV 1/2026')).toBe(0);
    });
    test('null invoice number → 0', () => {
        expect(invoiceNumberSignal(['FV 1/2026'], null)).toBe(0);
    });
});

describe('nipSignal', () => {
    test('matching NIPs → 1', () => {
        expect(nipSignal('5261040828', '5261040828')).toBe(1);
    });
    test('different NIPs → 0', () => {
        expect(nipSignal('5261040828', '1234567890')).toBe(0);
    });
    test('null → 0', () => {
        expect(nipSignal(null, '5261040828')).toBe(0);
    });
});

describe('accountSignal', () => {
    test('matching accounts (with spaces) → 1', () => {
        expect(accountSignal('73 1160 2202 0000 0006 5894 4255', '73116022020000000658944255')).toBe(1);
    });
    test('different accounts → 0', () => {
        expect(accountSignal('73116022020000000658944255', '11222233334444555566667777')).toBe(0);
    });
});

describe('nameSimilarity', () => {
    test('identical → 1', () => {
        expect(nameSimilarity('Envi sp z oo', 'Envi sp z oo')).toBeCloseTo(1);
    });
    test('completely different → close to 0', () => {
        expect(nameSimilarity('AAAAA', 'ZZZZZ')).toBeLessThan(0.2);
    });
    test('null → 0', () => {
        expect(nameSimilarity(null, 'test')).toBe(0);
    });
    test('minor typo → high score', () => {
        expect(nameSimilarity('Envi Sp. z o.o.', 'Envi Sp z oo')).toBeGreaterThan(0.7);
    });
});

describe('amountSignal', () => {
    test('exact match → 1', () => {
        expect(amountSignal(1000, 1000)).toBe(1);
    });
    test('within tolerance → 1', () => {
        expect(amountSignal(999.99, 1000)).toBe(1);
    });
    test('partial payment → 0 < score < 1', () => {
        const s = amountSignal(500, 1000);
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
    });
    test('overpayment → score < 1', () => {
        expect(amountSignal(1100, 1000)).toBeLessThan(1);
    });
    test('remaining zero → 0', () => {
        expect(amountSignal(100, 0)).toBe(0);
    });
});

describe('dateWindowSignal', () => {
    test('exec after issue, before dueDate → 1', () => {
        expect(dateWindowSignal('2026-04-15', '2026-01-01', '2026-05-01')).toBe(1);
    });
    test('exec before issue → 0', () => {
        expect(dateWindowSignal('2025-12-31', '2026-01-01', '2026-02-01')).toBe(0);
    });
    test('exec after issue, no dueDate → 0.5', () => {
        expect(dateWindowSignal('2026-04-15', '2026-01-01', null)).toBe(0.5);
    });
    test('exec beyond window → 0.5', () => {
        expect(dateWindowSignal('2026-09-01', '2026-01-01', '2026-02-01')).toBe(0.5);
    });
});
