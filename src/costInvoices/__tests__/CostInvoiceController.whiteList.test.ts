// Mock dependencies
jest.mock('../CostInvoiceRepository');
jest.mock('../whiteList/WhiteListClient');
jest.mock('../../invoices/KSeF/KsefService');

import CostInvoiceController, { CostInvoiceError } from '../CostInvoiceController';
import CostInvoiceRepository from '../CostInvoiceRepository';
import WhiteListClient from '../whiteList/WhiteListClient';
import KsefService from '../../invoices/KSeF/KsefService';
import CostInvoice from '../CostInvoice';

const VALID_NIP = '5260001016'; // checksum-poprawny NIP testowy
const VALID_NRB = '12345678901234567890123456'; // 26 cyfr

function minimalFa3Xml(nip: string, nrb: string, ksefNumber: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${nip}</NIP>
      <Nazwa>Test Dostawca Sp. z o.o.</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot1>
  <Fa>
    <P_1>2026-06-01</P_1>
    <P_2>FV/${ksefNumber}</P_2>
    <P_15>123.00</P_15>
    <Platnosc>
      <RachunekBankowy>
        <NrRB>${nrb}</NrRB>
      </RachunekBankowy>
    </Platnosc>
  </Fa>
</Faktura>`;
}

function makeInvoiceInfo(ksefNumber: string, xml: string) {
    return {
        ksefNumber,
        ksefReferenceNumber: ksefNumber,
        subjectNip: VALID_NIP,
        subjectName: 'Test Dostawca Sp. z o.o.',
        invoiceNumber: `FV/${ksefNumber}`,
        invoicingDate: '2026-06-01T00:00:00Z',
        acquisitionTimestamp: '2026-06-01T00:00:00Z',
        invoiceType: 'VAT',
        rawXml: xml,
    };
}

describe('CostInvoiceController — hook Białej Listy VAT przy imporcie KSeF', () => {
    let controller: CostInvoiceController;
    let mockRepository: jest.Mocked<CostInvoiceRepository>;
    let mockWhiteListClient: jest.Mocked<WhiteListClient>;
    let mockFetchAllPurchaseInvoices: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        controller = new CostInvoiceController();
        mockRepository = (controller as any).repository;
        mockWhiteListClient = (controller as any).whiteListClient;

        mockRepository.findLastCompletedSync.mockResolvedValue(null);
        mockRepository.createSync.mockResolvedValue(1);
        mockRepository.completeSync.mockResolvedValue(undefined);
        mockRepository.findExistingKsefNumbers.mockResolvedValue(new Set());
        mockRepository.create.mockResolvedValue(100);
        mockRepository.createItem.mockResolvedValue(1);

        // KsefService jest automockowany (jest.mock powyżej) — metody instancji żyją
        // na wspólnym mockowanym prototypie, więc podmieniamy je bezpośrednio.
        mockFetchAllPurchaseInvoices = KsefService.prototype.fetchAllPurchaseInvoices as jest.Mock;
    });

    describe('applyWhiteListCheck (hook bezpośrednio)', () => {
        it('RED-WITHOUT-FIX: gdy WhiteListClient.check rzuca wyjątek, hook NIE propaguje błędu i ustawia ERROR', async () => {
            const invoice = new CostInvoice({
                ksefNumber: 'K-1',
                supplierName: 'Test',
                supplierNip: VALID_NIP,
                supplierBankAccount: VALID_NRB,
                invoiceNumber: 'FV/1',
                issueDate: new Date('2026-06-01'),
            });

            mockWhiteListClient.check.mockRejectedValue(new Error('boom — API KAS padło'));

            // Ten test PADNIE bez try/catch w applyWhiteListCheck (hook by throwal, blokując import).
            await expect((controller as any).applyWhiteListCheck(invoice)).resolves.toBeUndefined();

            expect(invoice.whiteListStatus).toBe('ERROR');
            expect(invoice.whiteListCheckedAt).toBeInstanceOf(Date);
        });

        it('ustawia VERIFIED_OK z requestId gdy klient zwraca wynik pozytywny', async () => {
            const invoice = new CostInvoice({
                ksefNumber: 'K-2',
                supplierName: 'Test',
                supplierNip: VALID_NIP,
                supplierBankAccount: VALID_NRB,
                invoiceNumber: 'FV/2',
                issueDate: new Date('2026-06-01'),
            });

            const checkedAt = new Date('2026-06-01T12:00:00Z');
            mockWhiteListClient.check.mockResolvedValue({
                status: 'VERIFIED_OK',
                requestId: 'req-abc',
                checkedAt,
            });

            await (controller as any).applyWhiteListCheck(invoice);

            expect(invoice.whiteListStatus).toBe('VERIFIED_OK');
            expect(invoice.whiteListRequestId).toBe('req-abc');
            expect(invoice.whiteListCheckedAt).toEqual(checkedAt);
        });
    });

    describe('performSync (import KSeF pełna ścieżka) — fail-open', () => {
        it('RED-WITHOUT-FIX: import KOŃCZY SIĘ pomyślnie (imported=1, brak errors) mimo że WhiteList check rzuca wyjątek', async () => {
            const xml = minimalFa3Xml(VALID_NIP, VALID_NRB, 'KSEF-001');
            mockFetchAllPurchaseInvoices.mockResolvedValue([
                makeInvoiceInfo('KSEF-001', xml),
            ]);
            mockWhiteListClient.check.mockRejectedValue(new Error('KAS niedostępny'));

            const result = await controller.syncVerification(new Date('2026-06-01'), new Date('2026-06-30'));

            expect(result.imported).toBe(1);
            expect(result.failedCount).toBe(0);
            expect(result.errors).toEqual([]);
            expect(mockRepository.create).toHaveBeenCalledTimes(1);

            const createdInvoice = mockRepository.create.mock.calls[0][0] as CostInvoice;
            expect(createdInvoice.whiteListStatus).toBe('ERROR');
        });

        it('VERIFIED_OK: faktura z poprawnym NIP+NRB i pozytywnym wynikiem KAS zapisuje VERIFIED_OK + requestId', async () => {
            const xml = minimalFa3Xml(VALID_NIP, VALID_NRB, 'KSEF-002');
            mockFetchAllPurchaseInvoices.mockResolvedValue([
                makeInvoiceInfo('KSEF-002', xml),
            ]);
            mockWhiteListClient.check.mockResolvedValue({
                status: 'VERIFIED_OK',
                requestId: 'req-ok-1',
                checkedAt: new Date('2026-06-01T10:00:00Z'),
            });

            const result = await controller.syncVerification(new Date('2026-06-01'), new Date('2026-06-30'));

            expect(result.imported).toBe(1);
            const createdInvoice = mockRepository.create.mock.calls[0][0] as CostInvoice;
            expect(createdInvoice.whiteListStatus).toBe('VERIFIED_OK');
            expect(createdInvoice.whiteListRequestId).toBe('req-ok-1');
        });

        it('VERIFIED_MISMATCH: wynik NIE zapisuje VERIFIED_MISMATCH, import trwa dalej', async () => {
            const xml = minimalFa3Xml(VALID_NIP, VALID_NRB, 'KSEF-003');
            mockFetchAllPurchaseInvoices.mockResolvedValue([
                makeInvoiceInfo('KSEF-003', xml),
            ]);
            mockWhiteListClient.check.mockResolvedValue({
                status: 'VERIFIED_MISMATCH',
                requestId: 'req-mismatch-1',
                checkedAt: new Date('2026-06-01T10:00:00Z'),
            });

            const result = await controller.syncVerification(new Date('2026-06-01'), new Date('2026-06-30'));

            expect(result.imported).toBe(1);
            expect(result.errors).toEqual([]);
            const createdInvoice = mockRepository.create.mock.calls[0][0] as CostInvoice;
            expect(createdInvoice.whiteListStatus).toBe('VERIFIED_MISMATCH');
        });

        it('NOT_APPLICABLE: faktura bez rachunku bankowego dostawcy zapisuje NOT_APPLICABLE', async () => {
            const xmlNoBank = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura>
  <Podmiot1>
    <DaneIdentyfikacyjne>
      <NIP>${VALID_NIP}</NIP>
      <Nazwa>Test Dostawca Bez Konta</Nazwa>
    </DaneIdentyfikacyjne>
  </Podmiot1>
  <Fa>
    <P_1>2026-06-01</P_1>
    <P_2>FV/KSEF-004</P_2>
    <P_15>50.00</P_15>
  </Fa>
</Faktura>`;
            mockFetchAllPurchaseInvoices.mockResolvedValue([
                makeInvoiceInfo('KSEF-004', xmlNoBank),
            ]);
            mockWhiteListClient.check.mockResolvedValue({
                status: 'NOT_APPLICABLE',
                checkedAt: new Date('2026-06-01T10:00:00Z'),
            });

            const result = await controller.syncVerification(new Date('2026-06-01'), new Date('2026-06-30'));

            expect(result.imported).toBe(1);
            const createdInvoice = mockRepository.create.mock.calls[0][0] as CostInvoice;
            expect(createdInvoice.whiteListStatus).toBe('NOT_APPLICABLE');
            expect(createdInvoice.supplierBankAccount).toBeUndefined();
        });
    });

    describe('checkWhiteList (endpoint ręcznej (re-)weryfikacji)', () => {
        it('nadpisuje poprzedni wynik (re-check overwrites)', async () => {
            const existingInvoice = new CostInvoice({
                id: 42,
                ksefNumber: 'K-EXISTING',
                supplierName: 'Test',
                supplierNip: VALID_NIP,
                supplierBankAccount: VALID_NRB,
                invoiceNumber: 'FV/42',
                issueDate: new Date('2026-05-01'),
                whiteListStatus: 'VERIFIED_MISMATCH',
                whiteListRequestId: 'old-req',
                whiteListCheckedAt: new Date('2026-05-01T00:00:00Z'),
            });

            mockRepository.findById.mockResolvedValue(existingInvoice);
            mockRepository.updateWhiteList.mockResolvedValue(undefined);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);

            const newCheckedAt = new Date('2026-06-15T09:00:00Z');
            mockWhiteListClient.check.mockResolvedValue({
                status: 'VERIFIED_OK',
                requestId: 'new-req',
                checkedAt: newCheckedAt,
            });

            const result = await controller.checkWhiteList(42);

            expect(mockRepository.updateWhiteList).toHaveBeenCalledWith(42, {
                whiteListStatus: 'VERIFIED_OK',
                whiteListRequestId: 'new-req',
                whiteListCheckedAt: newCheckedAt,
            });
            expect(result.whiteListStatus).toBe('VERIFIED_OK');
            expect(result.whiteListRequestId).toBe('new-req');
        });

        it('rzuca CostInvoiceError 404 gdy faktura nie istnieje', async () => {
            mockRepository.findById.mockResolvedValue(null);

            await expect(controller.checkWhiteList(999)).rejects.toThrow(CostInvoiceError);
            await expect(controller.checkWhiteList(999)).rejects.toMatchObject({ statusCode: 404 });
        });

        it('przekazuje jawną datę (dzień płatności) do WhiteListClient.check', async () => {
            const existingInvoice = new CostInvoice({
                id: 7,
                ksefNumber: 'K-7',
                supplierName: 'Test',
                supplierNip: VALID_NIP,
                supplierBankAccount: VALID_NRB,
                invoiceNumber: 'FV/7',
                issueDate: new Date('2026-05-01'),
            });
            mockRepository.findById.mockResolvedValue(existingInvoice);
            mockRepository.updateWhiteList.mockResolvedValue(undefined);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);
            mockWhiteListClient.check.mockResolvedValue({
                status: 'VERIFIED_OK',
                requestId: 'r',
                checkedAt: new Date(),
            });

            const paymentDate = new Date('2026-07-01');
            await controller.checkWhiteList(7, paymentDate);

            expect(mockWhiteListClient.check).toHaveBeenCalledWith(VALID_NIP, VALID_NRB, paymentDate);
        });
    });
});
