/**
 * BankSyncController tests.
 * Covers: upload (duplicate file, idempotency), deleteAllocation (404, status reset, status preserved).
 */

jest.mock('../../tools/ToolsDb', () => ({
    __esModule: true,
    default: {
        getQueryCallbackAsync: jest.fn().mockResolvedValue([]),
        transaction: jest.fn().mockImplementation(async (cb: any) => {
            await cb({
                query: jest.fn().mockResolvedValue([{ insertId: 1 }]),
            });
        }),
    },
}));

jest.mock('../BankStatementRepository');
jest.mock('../BankTransferRepository');
jest.mock('../PaymentAllocationRepository');
jest.mock('../matching/TransferMatcher');
jest.mock('../../invoices/InvoiceRepository');
jest.mock('../../costInvoices/CostInvoiceRepository');

import BankSyncController, { BankSyncError } from '../BankSyncController';
import BankStatementRepository from '../BankStatementRepository';
import BankTransferRepository from '../BankTransferRepository';
import PaymentAllocationRepository from '../PaymentAllocationRepository';
import { TransferMatcher } from '../matching/TransferMatcher';
import PaymentAllocation from '../PaymentAllocation';
import InvoiceRepository from '../../invoices/InvoiceRepository';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<account-history>
  <search>
    <account>48102036680000550206787115</account>
    <date since="2026-04-22" to="2026-04-29"/>
  </search>
  <operations>
    <operation>
      <order-date>2026-04-29</order-date>
      <exec-date>2026-04-29</exec-date>
      <type>Przelew z rachunku</type>
      <description>Rachunek odbiorcy : 73116022020000000658944255 Nazwa odbiorcy :  TEST Tytuł :  FV 1/2026</description>
      <amount curr="PLN">-984.00</amount>
      <ending-balance curr="PLN">+1000.00</ending-balance>
    </operation>
  </operations>
</account-history>`;

describe('BankSyncController.upload', () => {
    let controller: BankSyncController;
    let mockStatementRepo: jest.Mocked<BankStatementRepository>;
    let mockTransferRepo: jest.Mocked<BankTransferRepository>;
    let mockMatcher: jest.Mocked<TransferMatcher>;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new BankSyncController();

        mockStatementRepo = (controller as any).statementRepo;
        mockTransferRepo = (controller as any).transferRepo;
        mockMatcher = (controller as any).matcher;

        mockMatcher.loadCandidates = jest.fn().mockResolvedValue({ invoices: [], costInvoices: [] });
        mockMatcher.propose = jest.fn().mockReturnValue({
            status: 'UNMATCHED',
            score: 0,
            candidates: [],
        });
        mockTransferRepo.insert = jest.fn().mockResolvedValue(1);
        mockStatementRepo.insert = jest.fn().mockResolvedValue(1);
    });

    test('rejects duplicate file with 409', async () => {
        mockStatementRepo.findByChecksum = jest.fn().mockResolvedValue({ id: 42, fileName: 'old.xml' });

        await expect(
            controller.upload(Buffer.from(SAMPLE_XML, 'utf8'), 'test.xml', null),
        ).rejects.toMatchObject({ statusCode: 409 });
    });

    test('accepts new file and returns preview', async () => {
        mockStatementRepo.findByChecksum = jest.fn().mockResolvedValue(null);

        const preview = await controller.upload(Buffer.from(SAMPLE_XML, 'utf8'), 'test.xml', null);

        expect(preview).toMatchObject({
            total: 1,
            unmatched: 1,
            autoMatched: 0,
            proposed: 0,
            fees: 0,
        });
        expect(mockStatementRepo.insert).toHaveBeenCalledTimes(1);
    });

    test('duplicate hash (overlapping export) does not throw', async () => {
        mockStatementRepo.findByChecksum = jest.fn().mockResolvedValue(null);
        // Simulate INSERT IGNORE returning insertId=0 (no insert)
        mockTransferRepo.insert = jest.fn().mockResolvedValue(0);

        const preview = await controller.upload(Buffer.from(SAMPLE_XML, 'utf8'), 'test2.xml', null);
        expect(preview.total).toBe(1);
    });

    test('saves own transfers outside the pending queue', async () => {
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockMatcher.propose.mockReturnValue({
            status: 'UNMATCHED', score: 0, candidates: [], flags: ['OWN_TRANSFER'],
        });

        const preview = await controller.upload(Buffer.from(SAMPLE_XML), 'test.xml', null);

        expect(mockTransferRepo.insert).toHaveBeenCalledWith(
            expect.objectContaining({ matchingStatus: 'MANUAL', matchingCandidates: null }),
            expect.anything(),
        );
        expect(preview).toMatchObject({ autoMatched: 0, proposed: 0, unmatched: 0 });
    });

    const statementWithIncomingDates = (...dates: string[]) => {
        const sampleOperation = SAMPLE_XML.match(/<operation>[\s\S]+?<\/operation>/)![0];
        const incomingOperation = sampleOperation
            .replace('FV 1/2026', 'FV 3/2026')
            .replace('-984.00', '+553.50');
        return Buffer.from(SAMPLE_XML.replace(
            sampleOperation,
            dates.map((date) => incomingOperation.replace(/2026-04-29/g, date)).join(''),
        ));
    };

    function prepareDuplicateSalesPayment() {
        const candidates = [{ invoiceId: 1, invoiceNumber: '3/2026', score: 0.6, remainingAmount: 553.50 }];
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.insert.mockReset().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
        mockMatcher.propose.mockReturnValue({
            status: 'CONFIRMED', score: 0.6, candidates, invoiceId: 1, allocatedAmount: 553.50,
        });

        const invoiceRepo = (controller as any).invoiceRepo as jest.Mocked<InvoiceRepository>;
        const allocationRepo = (controller as any).allocationRepo as jest.Mocked<PaymentAllocationRepository>;
        invoiceRepo.lockPaymentCandidate.mockResolvedValue(true);
        invoiceRepo.findDueAmount.mockResolvedValue(553.50);
        allocationRepo.insert.mockClear();
        allocationRepo.sumAllocatedForInvoice.mockImplementation(async () =>
            allocationRepo.insert.mock.calls.length ? 553.50 : 0,
        );
        return { allocationRepo, invoiceRepo, candidates };
    }

    test('allocates the earlier payment in either file order', async () => {
        const run = async (...dates: string[]) => {
            const { allocationRepo } = prepareDuplicateSalesPayment();
            const preview = await controller.upload(statementWithIncomingDates(...dates), 'test.xml', null);
            return {
                preview,
                dates: mockTransferRepo.insert.mock.calls.map(([transfer]) => transfer.execDate),
                allocations: allocationRepo.insert.mock.calls.map(([allocation]) => allocation.bankTransferId),
            };
        };
        const first = await run('2026-01-29', '2026-01-23');
        const second = await run('2026-01-23', '2026-01-29');

        expect(first).toEqual(second);
        expect(first.dates).toEqual(['2026-01-23', '2026-01-29']);
        expect(first.allocations).toEqual([1]);
    });

    test('keeps the candidates when the first transfer already covered the invoice', async () => {
        const { allocationRepo, invoiceRepo, candidates } = prepareDuplicateSalesPayment();
        const xml = statementWithIncomingDates('2026-01-23', '2026-01-29');
        const preview = await controller.upload(xml, 'test.xml', null);

        expect(preview).toMatchObject({ total: 2, autoMatched: 1, proposed: 1, unmatched: 0 });
        expect(mockMatcher.loadCandidates).toHaveBeenCalledTimes(1);
        expect(mockMatcher.loadCandidates).toHaveBeenCalledWith(new Set(['IN']));
        expect(allocationRepo.insert).toHaveBeenCalledTimes(1);
        expect(invoiceRepo.updatePayment).toHaveBeenCalledWith(
            1, { paymentStatus: 'PAID', paidAmount: 553.50 }, expect.anything(),
        );
        expect(mockTransferRepo.updateMatchingStatus).toHaveBeenCalledWith(
            2, 'PROPOSED', 60, candidates, expect.anything(),
        );
    });
});

describe('BankSyncController.deleteAllocation', () => {
    let controller: BankSyncController;
    let mockAllocationRepo: jest.Mocked<PaymentAllocationRepository>;
    let mockTransferRepo: jest.Mocked<BankTransferRepository>;

    const makeAlloc = (overrides: Partial<PaymentAllocation> = {}) =>
        new PaymentAllocation({
            id: 10,
            bankTransferId: 5,
            invoiceId: null,
            costInvoiceId: null,
            allocatedAmount: 500,
            allocatedPercentage: 100,
            source: 'MANUAL',
            ...overrides,
        });

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new BankSyncController();
        mockAllocationRepo = (controller as any).allocationRepo;
        mockTransferRepo = (controller as any).transferRepo;

        mockAllocationRepo.delete = jest.fn().mockResolvedValue(undefined);
        mockTransferRepo.updateMatchingStatus = jest.fn().mockResolvedValue(undefined);
    });

    test('throws 404 when allocation not found', async () => {
        mockAllocationRepo.findById = jest.fn().mockResolvedValue(null);

        await expect(controller.deleteAllocation(99)).rejects.toMatchObject({ statusCode: 404 });
        expect(mockAllocationRepo.delete).not.toHaveBeenCalled();
    });

    test('resets transfer to UNMATCHED when last allocation is deleted', async () => {
        mockAllocationRepo.findById = jest.fn().mockResolvedValue(makeAlloc());
        mockAllocationRepo.findByTransferId = jest.fn().mockResolvedValue([]);

        await controller.deleteAllocation(10);

        expect(mockAllocationRepo.delete).toHaveBeenCalledWith(10, expect.anything());
        expect(mockTransferRepo.updateMatchingStatus).toHaveBeenCalledWith(
            5, 'UNMATCHED', null, null, expect.anything(),
        );
    });

    test('does not reset transfer status when other allocations still exist', async () => {
        mockAllocationRepo.findById = jest.fn().mockResolvedValue(makeAlloc());
        mockAllocationRepo.findByTransferId = jest.fn().mockResolvedValue([makeAlloc({ id: 11 })]);

        await controller.deleteAllocation(10);

        expect(mockAllocationRepo.delete).toHaveBeenCalledWith(10, expect.anything());
        expect(mockTransferRepo.updateMatchingStatus).not.toHaveBeenCalled();
    });
});
