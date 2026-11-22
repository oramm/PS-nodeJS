/**
 * TransferMatcher: kwota należna brutto (z rodziną korekt), pominięcie przelewów własnych, jednorazowe wczytanie puli.
 * Liczby odwzorowują realne faktury z kopii produkcji (stan 2026-11-22).
 */
jest.mock('../../tools/ToolsDb', () => ({
    __esModule: true,
    default: { getQueryCallbackAsync: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../invoices/InvoiceRepository');

import { TransferMatcher, MatchInput, CandidatePool } from '../matching/TransferMatcher';
import InvoiceRepository from '../../invoices/InvoiceRepository';
import { extractInvoiceNumbers } from '../parsers/pkoBpDescriptionHelpers';
import Setup from '../../setup/Setup';
import ToolsDb from '../../tools/ToolsDb';

const row = (id: number, number: string, due: number, paid = 0) => ({
    Id: id,
    InvoiceNumber: number,
    IssueDate: '2026-07-01',
    PaymentDeadline: '2026-08-01',
    DueAmount: due,
    AllocatedAmount: paid,
    EntityTaxNumber: '1111111111',
    EntityBankAccount: null,
    EntityName: 'Klient',
});

const pool = (...invoices: CandidatePool['invoices']): CandidatePool => ({ invoices, costInvoices: [] });

const incoming = (title: string, amount: number, extra: Partial<MatchInput> = {}): MatchInput => ({
    direction: 'IN',
    amount,
    currency: 'PLN',
    execDate: '2026-08-10',
    counterpartyAccount: '11102000000000000000000001',
    counterpartyName: 'Klient',
    counterpartyNip: null,
    invoiceNumbers: extractInvoiceNumbers(`Tytuł :  ${title}`),
    ...extra,
});

describe('TransferMatcher - wpływy na faktury sprzedaży', () => {
    const matcher = new TransferMatcher();

    test.each([
        ['243/2026', 6150, 5000],
        ['330/2026', 73800, 60000],
        ['212/2026', 53876.73, 13692.24],
    ])('FV %s potwierdza wpłatę brutto rodziny %s, a kwota %s jest propozycją', (number, due, partial) => {
        const candidates = pool(row(1, number, due));
        expect(matcher.propose(incoming(`FV ${number}`, due), candidates)).toMatchObject({
            status: 'CONFIRMED', invoiceId: 1, allocatedAmount: due,
        });
        expect(matcher.propose(incoming(`FV ${number}`, partial), candidates).status).toBe('PROPOSED');
    });

    test('próg jednego grosza dotyczy pozostającej należności', () => {
        const candidates = pool(row(1, '243/2026', 6150, 1000));
        expect(matcher.propose(incoming('FV 243/2026', 5150.01), candidates)).toMatchObject({
            status: 'CONFIRMED', allocatedAmount: 5150,
        });
        expect(matcher.propose(incoming('FV 243/2026', 5150.02), candidates).status).toBe('PROPOSED');
    });

    test('dwie zgodne pary numer–kwota wymagają weryfikacji', () => {
        const candidates = pool(row(2, '243/2026', 6150), row(1, '243/2026', 6150));
        const proposal = matcher.propose(incoming('FV 243/2026', 6150), candidates);
        expect(proposal.status).toBe('PROPOSED');
        expect(proposal.candidates.map((candidate) => candidate.invoiceId)).toEqual([1, 2]);
    });

    test('faktura już w pełni przypisana nie jest kandydatem', () => {
        const candidates = pool(row(1, '243/2026', 6150, 6150));
        expect(matcher.propose(incoming('FV 243/2026', 6150), candidates).candidates).toEqual([]);
    });

    test('zapytanie puli wyklucza wycofane oryginały i nie zwraca korekt jako kandydatów', async () => {
        const { default: Repository } = jest.requireActual<typeof import('../../invoices/InvoiceRepository')>(
            '../../invoices/InvoiceRepository',
        );
        const { SENT, SENT_TO_KSEF, CORRECTED, PAID, WITHDRAWN } = Setup.InvoiceStatus;
        const query = jest.mocked(ToolsDb.getQueryCallbackAsync);
        const candidates = pool(...await new Repository().findPaymentCandidates());
        expect(query).toHaveBeenCalledTimes(1);
        const [sql] = query.mock.calls[0];
        expect(sql).toContain(`i.Status IN ('${SENT}', '${SENT_TO_KSEF}', '${CORRECTED}')`);
        expect(sql).toContain(`i.Status = '${PAID}' AND i.IssueDate >= '2025-01-01'`);
        expect(sql).not.toContain(WITHDRAWN);
        expect(sql).toContain('SELECT Id, Id FROM Invoices WHERE CorrectedInvoiceId IS NULL');
        expect(sql).toMatch(/ORDER BY i\.Id$/);
        expect(matcher.propose(incoming('FV 1/2026', 6150), candidates)).toMatchObject({
            status: 'UNMATCHED', candidates: [],
        });
    });

    test('kwota rodziny uwzględnia oryginał i tylko wystawione korekty', async () => {
        const { default: Repository } = jest.requireActual<typeof import('../../invoices/InvoiceRepository')>(
            '../../invoices/InvoiceRepository',
        );
        const { SENT, SENT_TO_KSEF, CORRECTED, PAID } = Setup.InvoiceStatus;
        const query = jest.mocked(ToolsDb.getQueryCallbackAsync);
        await new Repository().findDueAmount(1);
        expect(query).toHaveBeenCalledTimes(1);
        const [sql, , params] = query.mock.calls[0];
        expect(sql).toContain('JOIN Invoices i ON i.Id = f.Id');
        expect(sql).toContain(`WHERE f.Id = f.RootId OR i.Status IN ('${SENT}', '${SENT_TO_KSEF}', '${CORRECTED}', '${PAID}')`);
        expect(params).toEqual([1]);
    });

    test('numer w opisie automatycznie tylko z tytułu lub struktury płatności VAT', () => {
        const candidates = pool(row(1, '243/2026', 6150));
        const input = incoming('', 6150);
        const vatReference = 'Numer faktury VAT lub okres płatności zbiorczej :  243/2026';
        expect(matcher.propose({ ...input, invoiceNumbers: extractInvoiceNumbers(vatReference, false) }, candidates).status)
            .toBe('CONFIRMED');
        expect(matcher.propose({
            ...input, invoiceNumbers: extractInvoiceNumbers('Adres nadawcy :  243/2026', false),
        }, candidates).status).not.toBe('CONFIRMED');
    });

    test.each([
        ['rachunek główny', 0],
        ['rachunek VAT / przelew PIT', 1],
        ['rachunek ENVI', 2],
        ['rachunek US / przelew PIT', 3],
    ])('pomija %s nawet przy pasującej fakturze', (_name, accountIndex) => {
        const input = incoming('FV 243/2026', 6150, {
            counterpartyAccount: Setup.Bank.ownAccounts[accountIndex],
        });
        expect(matcher.propose(input, pool(row(1, '243/2026', 6150)))).toMatchObject({
            status: 'UNMATCHED', candidates: [], flags: ['OWN_TRANSFER'],
        });
    });

    test('NIP na wpływie nie wpływa na dopasowanie nawet gdy zgadza się z NIP-em faktury', () => {
        const nip = '1234567890';
        const candidates = pool({ ...row(1, '243/2026', 6150), EntityTaxNumber: nip });
        const input = incoming('FV 243/2026', 6150);
        const withoutNip = matcher.propose(input, candidates);
        expect(withoutNip.status).toBe('CONFIRMED');
        expect(matcher.propose({ ...input, counterpartyNip: nip }, candidates)).toEqual(withoutNip);
    });

    test('pula wpływów wczytuje kandydatów raz, bez zapytania o faktury kosztowe', async () => {
        const repo = (matcher as any).invoiceRepo as jest.Mocked<InvoiceRepository>;
        repo.findPaymentCandidates = jest.fn().mockResolvedValue([]);
        const loaded = await matcher.loadCandidates(new Set(['IN']));
        matcher.propose(incoming('FV 1/2026', 100), loaded);
        matcher.propose(incoming('FV 2/2026', 100), loaded);
        expect(repo.findPaymentCandidates).toHaveBeenCalledTimes(1);
        expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    });
});
