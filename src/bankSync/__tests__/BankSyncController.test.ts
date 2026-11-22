/**
 * BankSyncController tests.
 * Covers: upload (duplicate file, idempotency), deleteAllocation (404, status reset, status preserved).
 */

jest.mock('../../tools/ToolsDb', () => ({
    __esModule: true,
    default: {
        getQueryCallbackAsync: jest.fn().mockResolvedValue([]),
        transaction: jest.fn().mockImplementation(async (cb: any) => {
            return cb({
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
jest.mock('../../invoices/InvoicesController');
jest.mock('../../costInvoices/CostInvoiceRepository');

import BankSyncController, { BankSyncError } from '../BankSyncController';
import BankStatementRepository from '../BankStatementRepository';
import BankTransferRepository from '../BankTransferRepository';
import PaymentAllocationRepository from '../PaymentAllocationRepository';
import { TransferMatcher } from '../matching/TransferMatcher';
import PaymentAllocation from '../PaymentAllocation';
import InvoiceRepository from '../../invoices/InvoiceRepository';
import InvoicesController from '../../invoices/InvoicesController';
import BankTransfer from '../BankTransfer';
import Setup from '../../setup/Setup';

const paymentStatuses = Setup.InvoicePaymentStatus;
const recalculatePayment = jest.mocked(InvoicesController.recalculatePayment);

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

    test('counts a known operation without allocating it', async () => {
        mockStatementRepo.findByChecksum = jest.fn().mockResolvedValue(null);
        mockTransferRepo.insert.mockResolvedValue(0);
        mockMatcher.propose.mockReturnValue({
            status: 'CONFIRMED', score: 1, candidates: [], costInvoiceId: 1, allocatedAmount: 984,
        });

        const preview = await controller.upload(Buffer.from(SAMPLE_XML, 'utf8'), 'test2.xml', null);
        expect(preview).toMatchObject({ total: 0, alreadyKnown: 1, autoMatched: 0, proposed: 0, unmatched: 0 });
        expect((controller as any).allocationRepo.insert).not.toHaveBeenCalled();
    });

    test('counts twins once each and only new transfers in overlapping exports', async () => {
        const knownHashes = new Set<string>();
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.insert.mockImplementation(async ({ operationHash }) => {
            if (knownHashes.has(operationHash)) return 0;
            knownHashes.add(operationHash);
            return knownHashes.size;
        });

        const transfer = SAMPLE_XML.match(/<operation>[\s\S]+?<\/operation>/)![0];
        const fee = transfer
            .replace('Przelew z rachunku', 'Opłata')
            .replace(/<description>.*<\/description>/, '<description>Opłata za prowadzenie rachunku</description>')
            .replace('-984.00', '-5.00');
        const twin = fee.replace('+1000.00', '+995.00');
        const foreign = transfer.replace('curr="PLN">-984.00', 'curr="EUR">-984.00');
        const nextDay = transfer.replace(/2026-04-29/g, '2026-04-30');
        const first = SAMPLE_XML.replace(transfer, [transfer, fee, twin, foreign].join(''));
        const second = SAMPLE_XML
            .replace('since="2026-04-22" to="2026-04-29"', 'since="2026-04-29" to="2026-04-30"')
            .replace(transfer, [nextDay, foreign, twin, fee, transfer].join(''))
            .replace(/<ending-balance[^>]*>[^<]*<\/ending-balance>/g, '');

        await expect(controller.upload(Buffer.from(first), 'first.xml')).resolves.toMatchObject({
            total: 4, alreadyKnown: 0, fees: 2, foreignCurrency: 1, unmatched: 1,
        });
        await expect(controller.upload(Buffer.from(second), 'second.xml')).resolves.toMatchObject({
            total: 1, alreadyKnown: 4, fees: 0, foreignCurrency: 0, unmatched: 1,
        });
        await expect(controller.upload(Buffer.from(second + '\n'), 'reexport.xml')).resolves.toMatchObject({
            total: 0, alreadyKnown: 5, fees: 0, foreignCurrency: 0, unmatched: 0,
        });
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
        invoiceRepo.lockPaymentCandidate.mockResolvedValue({ Number: '3/2026', Status: Setup.InvoiceStatus.SENT });
        invoiceRepo.findDueAmount.mockResolvedValue(553.50);
        allocationRepo.insert.mockClear();
        allocationRepo.getInvoicePayment.mockImplementation(async () => ({
            paidAmount: allocationRepo.insert.mock.calls.length ? 553.50 : 0,
            paymentDate: null,
        }));
        allocationRepo.sumAllocatedForTransfer.mockResolvedValue(0);
        recalculatePayment.mockResolvedValue({
            paymentStatus: paymentStatuses.PAID, paidAmount: 553.50, paymentDate: '2026-01-23', status: Setup.InvoiceStatus.PAID,
        });
        return { allocationRepo, candidates };
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
        const { allocationRepo, candidates } = prepareDuplicateSalesPayment();
        const xml = statementWithIncomingDates('2026-01-23', '2026-01-29');
        const preview = await controller.upload(xml, 'test.xml', null);

        expect(preview).toMatchObject({ total: 2, autoMatched: 1, proposed: 1, unmatched: 0 });
        expect(mockMatcher.loadCandidates).toHaveBeenCalledTimes(1);
        expect(mockMatcher.loadCandidates).toHaveBeenCalledWith(new Set(['IN']));
        expect(allocationRepo.insert).toHaveBeenCalledTimes(1);
        expect(recalculatePayment).toHaveBeenCalledWith(1, expect.anything());
        expect(mockTransferRepo.updateMatchingStatus).toHaveBeenCalledWith(
            2, 'PROPOSED', 60, candidates, expect.anything(),
        );
    });
});

describe('BankSyncController manual sales allocations', () => {
    let controller: BankSyncController;
    let statementRepo: jest.Mocked<BankStatementRepository>;
    let transferRepo: jest.Mocked<BankTransferRepository>;
    let invoiceRepo: jest.Mocked<InvoiceRepository>;
    let allocationRepo: jest.Mocked<PaymentAllocationRepository>;
    let transfer: BankTransfer;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new BankSyncController();
        statementRepo = (controller as any).statementRepo;
        transferRepo = (controller as any).transferRepo;
        invoiceRepo = (controller as any).invoiceRepo;
        allocationRepo = (controller as any).allocationRepo;
        transfer = new BankTransfer({
            id: 1, bankStatementId: 1, execDate: '2026-11-20', operationHash: 'test',
            currency: 'PLN', amount: 150, direction: 'IN', operationType: 'Przelew',
            matchingStatus: 'PROPOSED', matchingCandidates: [{ invoiceId: 10, score: 0.7 }],
        });
        statementRepo.findById.mockResolvedValue({ id: 1 } as any);
        transferRepo.findById.mockResolvedValue(transfer);
        transferRepo.findByStatementIdAndStatus.mockResolvedValue([transfer]);
        invoiceRepo.lockPaymentCandidate.mockResolvedValue({ Number: '10/2026', Status: Setup.InvoiceStatus.SENT });
        invoiceRepo.lockPaymentInvoice.mockResolvedValue({
            Status: Setup.InvoiceStatus.SENT, CorrectedInvoiceId: null, PaidManually: 0, StatusBeforePayment: null,
        } as NonNullable<Awaited<ReturnType<InvoiceRepository['lockPaymentInvoice']>>>);
        invoiceRepo.findDueAmount.mockResolvedValue(100);
        allocationRepo.insert.mockImplementation(async () => allocationRepo.insert.mock.calls.length);
        allocationRepo.getInvoicePayment.mockImplementation(async (invoiceId) => ({
            paidAmount: allocationRepo.insert.mock.calls
                .filter(([allocation]) => allocation.invoiceId === invoiceId)
                .reduce((sum, [allocation]) => sum + allocation.allocatedAmount, 0),
            paymentDate: null,
        }));
        allocationRepo.sumAllocatedForTransfer.mockImplementation(async (transferId) =>
            allocationRepo.insert.mock.calls.filter(([allocation]) => allocation.bankTransferId === transferId)
                .reduce((sum, [allocation]) => sum + allocation.allocatedAmount, 0),
        );
        recalculatePayment.mockImplementation(async (invoiceId, conn) => {
            const { paidAmount } = await allocationRepo.getInvoicePayment(invoiceId, conn);
            return {
                paymentStatus: paidAmount === 100 ? paymentStatuses.PAID : paymentStatuses.PARTIALLY_PAID,
                paidAmount, paymentDate: transfer.execDate,
                status: paidAmount === 100 ? Setup.InvoiceStatus.PAID : Setup.InvoiceStatus.SENT,
            };
        });
    });

    test('splits a transfer without exceeding either invoice due or the transfer total', async () => {
        const first = await controller.createAllocation(1, { invoiceId: 10, amount: 120 });
        const second = await controller.createAllocation(1, { invoiceId: 11, amount: 80 });

        expect(first).toMatchObject({ allocatedAmount: 100, newPaymentStatus: paymentStatuses.PAID });
        expect(second).toMatchObject({ allocatedAmount: 50, newPaymentStatus: paymentStatuses.PARTIALLY_PAID });
        await expect(controller.createAllocation(1, { invoiceId: 12, amount: 1 }))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(invoiceRepo.lockPaymentCandidate).toHaveBeenCalledWith(10, expect.anything());
        expect(allocationRepo.insert).toHaveBeenCalledTimes(2);
    });

    test.each([
        [60, 60],
        [150, 100],
    ])('commits a unique sales candidate and caps a %s transfer at %s', async (amount, expectedAmount) => {
        transfer.amount = amount;
        transfer.matchingCandidates![0].remainingAmount = 140;
        await expect(controller.commit(1)).resolves.toEqual({ committed: 1 });
        expect(allocationRepo.insert).toHaveBeenCalledWith(
            expect.objectContaining({ allocatedAmount: expectedAmount, invoiceId: 10 }), expect.anything(),
        );
    });

    test('keeps a proposal with two equally scored candidates', async () => {
        transfer.matchingCandidates!.push({ invoiceId: 11, score: 0.7 });
        await expect(controller.commit(1)).resolves.toEqual({ committed: 0 });
        expect(allocationRepo.insert).not.toHaveBeenCalled();
        expect(transferRepo.updateMatchingStatus).not.toHaveBeenCalled();
    });

    test('does not substitute a different invoice when the first candidate is no longer the clear choice', async () => {
        transfer.matchingCandidates!.push({ invoiceId: 11, score: 0.8 });
        await expect(controller.commit(1)).resolves.toEqual({ committed: 0 });
        expect(allocationRepo.insert).not.toHaveBeenCalled();
    });
});

test('replay report and sample are identical regardless of the order of rows returned', async () => {
    const makeTransfer = (id: number, date: string) => new BankTransfer({
        id, bankStatementId: 1, execDate: date, orderDate: date, operationHash: String(id), amount: 100,
        direction: 'IN', currency: 'PLN', operationType: 'Przelew', title: 'FV 10/2026',
        description: 'Tytuł : FV 10/2026', matchingStatus: 'PROPOSED',
    });
    const first = makeTransfer(1, '2026-01-20');
    const second = makeTransfer(2, '2026-01-25');
    const run = async (rows: BankTransfer[]) => {
        const controller = new BankSyncController();
        const transfers = (controller as any).transferRepo as jest.Mocked<BankTransferRepository>;
        const invoices = (controller as any).invoiceRepo as jest.Mocked<InvoiceRepository>;
        const allocations = (controller as any).allocationRepo as jest.Mocked<PaymentAllocationRepository>;
        const matcher = (controller as any).matcher as jest.Mocked<TransferMatcher>;
        const conn = {} as Parameters<BankSyncController['recalculateIncoming']>[0];
        transfers.lockUnallocatedIncoming.mockResolvedValue(rows);
        invoices.lockPaymentCandidate.mockResolvedValue({ Number: '10/2026', Status: Setup.InvoiceStatus.SENT });
        invoices.findDueAmount.mockResolvedValue(100);
        invoices.countOverallocatedInvoices.mockResolvedValue(0);
        allocations.countOverallocatedTransfers.mockResolvedValue(0);
        allocations.sumAllocatedForTransfer.mockResolvedValue(0);
        allocations.insert.mockResolvedValue(999);
        allocations.getInvoicePayment.mockImplementation(async () => ({
            paidAmount: allocations.insert.mock.calls.length ? 100 : 0, paymentDate: null,
        }));
        matcher.loadCandidates.mockResolvedValue({
            invoices: [{
                Id: 10, InvoiceNumber: '10/2026', IssueDate: null, PaymentDeadline: null,
                DueAmount: 100, AllocatedAmount: 0, EntityTaxNumber: null, EntityName: null, EntityBankAccount: null,
            }],
            costInvoices: [],
        });
        matcher.propose.mockReturnValue({
            status: 'CONFIRMED', score: 0.7, invoiceId: 10, allocatedAmount: 100,
            candidates: [{ invoiceId: 10, invoiceNumber: '10/2026', score: 0.7, remainingAmount: 100 }],
        });
        recalculatePayment.mockResolvedValue({
            paidAmount: 100, paymentDate: first.execDate, paymentStatus: paymentStatuses.PAID, status: Setup.InvoiceStatus.PAID,
        });
        const report = await controller.recalculateIncoming(conn);
        expect(matcher.loadCandidates).toHaveBeenCalledTimes(1);
        expect(transfers.updateMatchingStatus).toHaveBeenNthCalledWith(
            2, 2, 'PROPOSED', 70, expect.any(Array), conn,
        );
        return report;
    };

    const report = await run([second, first]);
    expect(JSON.stringify(await run([first, second]))).toBe(JSON.stringify(report));
    expect(report.counts).toMatchObject({ automatic: 1, newlyPaid: 1, proposals: 1, rejectedByAllocationGuard: 1 });
    expect(report.automaticSample).toEqual([{
        invoiceNumber: '10/2026', title: 'FV 10/2026', titleSource: 'title', amount: 100, date: first.execDate,
    }]);
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
