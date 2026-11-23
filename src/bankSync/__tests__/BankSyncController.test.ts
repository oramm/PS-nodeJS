/**
 * BankSyncController tests.
 * Covers: upload (duplicate file, idempotency), deleteAllocation (404, status reset, status preserved).
 */

jest.mock('../../tools/ToolsDb', () => ({
    __esModule: true,
    default: {
        getQueryCallbackAsync: jest.fn().mockResolvedValue([]),
        pool: { getConnection: jest.fn() },
        transaction: jest.fn().mockImplementation(async (cb: any) => {
            return cb({
                query: jest.fn().mockResolvedValue([{ insertId: 1 }]),
            });
        }),
    },
}));

jest.mock('../BankStatementRepository');
jest.mock('../BankTransferRepository', () => ({
    ...jest.createMockFromModule<typeof import('../BankTransferRepository')>('../BankTransferRepository'),
    BankTransferInsertWarning: jest.requireActual<typeof import('../BankTransferRepository')>('../BankTransferRepository').BankTransferInsertWarning,
}));
jest.mock('../PaymentAllocationRepository');
jest.mock('../matching/TransferMatcher');
jest.mock('../../invoices/InvoiceRepository');
jest.mock('../../invoices/InvoicesController');
jest.mock('../../costInvoices/CostInvoiceRepository');

import { setImmediate } from 'node:timers/promises';
import type { PoolConnection } from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';
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
import { PkoBpXmlParser } from '../parsers/PkoBpXmlParser';

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

    async function finishedJob(jobId: string) {
        let job = controller.getImportStatus(jobId);
        while (job.status === 'running') {
            await setImmediate();
            job = controller.getImportStatus(jobId);
        }
        return job;
    }

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
        mockTransferRepo.findImportOperations.mockResolvedValue([]);
        mockStatementRepo.acquireImportLock.mockResolvedValue(true);
        jest.mocked(ToolsDb.pool.getConnection).mockResolvedValue({
            query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
        } as unknown as PoolConnection);
        mockStatementRepo.insert = jest.fn().mockResolvedValue(1);
        mockStatementRepo.findPeriods.mockResolvedValue([]);
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

    test('retries the entire import once after a database deadlock', async () => {
        const deadlock = Object.assign(new Error('deadlock'), { code: 'ER_LOCK_DEADLOCK' });
        mockStatementRepo.findPeriods.mockRejectedValueOnce(deadlock);
        const conn = await ToolsDb.pool.getConnection();

        await expect(controller.upload(Buffer.from(SAMPLE_XML), 'test.xml')).resolves.toMatchObject({
            total: 1, alreadyKnown: 0, needsReview: 0,
        });
        expect(conn.rollback).toHaveBeenCalledTimes(1);
        expect(conn.commit).toHaveBeenCalledTimes(1);
        expect(mockTransferRepo.insert).toHaveBeenCalledTimes(2);
    });

    test('background import returns the same result as synchronous import', async () => {
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        const file = Buffer.from(SAMPLE_XML);
        const expected = await controller.upload(file, 'test.xml', 1);
        const { jobId } = await controller.startUpload(file, 'test.xml', 1);
        expect(controller.getImportStatus(jobId)).toEqual({ status: 'running' });
        expect(mockStatementRepo.insert).toHaveBeenCalledTimes(1);
        expect(await finishedJob(jobId)).toEqual({ status: 'done', result: expected });
        expect(mockStatementRepo.insert).toHaveBeenCalledTimes(2);
    });

    test('rejects another upload during validation and during import', async () => {
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        const file = Buffer.from(SAMPLE_XML);
        const next = () => controller.startUpload(file, 'second.xml');
        const first = controller.startUpload(file, 'first.xml');
        const busy = { statusCode: 409, message: expect.stringContaining('Trwa wgrywanie') };
        await expect(next()).rejects.toMatchObject(busy);
        const { jobId } = await first;
        await expect(next()).rejects.toMatchObject(busy);
        await finishedJob(jobId);
        expect(mockStatementRepo.insert).toHaveBeenCalledTimes(1);
    });

    test('expires a 10-minute import and keeps the newer import locked when the old one finishes', async () => {
        jest.useFakeTimers({ doNotFake: ['setImmediate'] });
        try {
            mockStatementRepo.findByChecksum.mockResolvedValue(null);
            let finishFirst!: (id: number) => void;
            let finishSecond!: (id: number) => void;
            const firstWrite = new Promise<number>(resolve => { finishFirst = resolve; });
            const secondWrite = new Promise<number>(resolve => { finishSecond = resolve; });
            mockTransferRepo.insert.mockImplementationOnce(() => firstWrite).mockImplementationOnce(() => secondWrite);

            const file = Buffer.from(SAMPLE_XML);
            const first = await controller.startUpload(file, 'first.xml');
            await setImmediate();
            expect(mockTransferRepo.insert).toHaveBeenCalledTimes(1);
            jest.advanceTimersByTime(10 * 60 * 1000 - 1);
            expect(controller.getImportStatus(first.jobId)).toEqual({ status: 'running' });
            await expect(controller.startUpload(file, 'second.xml')).rejects.toMatchObject({ statusCode: 409 });
            jest.advanceTimersByTime(1);
            const expired = controller.getImportStatus(first.jobId);
            expect(expired).toMatchObject({ status: 'failed', error: expect.stringContaining('limit czasu') });

            const second = await controller.startUpload(file, 'second.xml');
            await setImmediate();
            expect(mockTransferRepo.insert).toHaveBeenCalledTimes(2);
            finishFirst(1);
            await setImmediate();
            expect(controller.getImportStatus(first.jobId)).toEqual(expired);
            expect(controller.getImportStatus(second.jobId)).toEqual({ status: 'running' });
            await expect(controller.startUpload(file, 'third.xml')).rejects.toMatchObject({ statusCode: 409 });

            finishSecond(2);
            expect(await finishedJob(second.jobId)).toMatchObject({ status: 'done' });
        } finally {
            jest.useRealTimers();
        }
    });

    test('rejects a duplicate or invalid XML before scheduling a job and permits a corrected upload', async () => {
        const file = Buffer.from(SAMPLE_XML);
        mockStatementRepo.findByChecksum = jest.fn().mockResolvedValueOnce({ id: 42 }).mockResolvedValue(null);
        await expect(controller.startUpload(file, 'duplicate.xml')).rejects.toMatchObject({ statusCode: 409 });
        await expect(controller.startUpload(Buffer.from(SAMPLE_XML.replace('</operation>', '')), 'invalid.xml'))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(mockStatementRepo.insert).not.toHaveBeenCalled();
        const { jobId } = await controller.startUpload(file, 'valid.xml');
        expect(await finishedJob(jobId)).toMatchObject({ status: 'done' });
    });

    test('logs sanitized database warnings with the original operation number and rolls back the whole import', async () => {
        const { default: ActualTransferRepository } = jest.requireActual<typeof import('../BankTransferRepository')>('../BankTransferRepository');
        const query = jest.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ insertId: 1, warningStatus: 0 }])
            .mockResolvedValueOnce([{ insertId: 2, warningStatus: 2 }])
            .mockResolvedValueOnce([[
                { Code: 1265, Message: "Testowa dana osobowa, data truncated for column 'OperationType' at row 1" },
                { Code: 1292, Message: "Testowa dana osobowa, incorrect value for column 'NieznanePole' at row 1" },
            ]]);
        const conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query };
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        try {
            jest.mocked(ToolsDb.pool.getConnection).mockResolvedValueOnce(conn as unknown as PoolConnection);
            mockStatementRepo.findByChecksum.mockResolvedValue(null);
            const repo = new ActualTransferRepository();
            mockTransferRepo.insert.mockImplementationOnce(repo.insert.bind(repo)).mockImplementationOnce(repo.insert.bind(repo));
            const file = statementWithIncomingDates('2026-04-29', '', '2026-04-28');
            const { jobId } = await controller.startUpload(file, 'test.xml');
            expect(await finishedJob(jobId)).toEqual({
                status: 'failed', error: 'Operacja z pliku ma pole dłuższe, niż przyjmuje system - import wycofany, nic nie zapisano.',
            });
            expect(mockStatementRepo.insert).toHaveBeenCalledWith(expect.anything(), conn);
            expect(mockTransferRepo.insert).toHaveBeenCalledTimes(2);
            expect(mockTransferRepo.insert).toHaveBeenNthCalledWith(1, expect.objectContaining({ execDate: '2026-04-28' }), conn, 3);
            expect(mockTransferRepo.insert).toHaveBeenNthCalledWith(2, expect.objectContaining({ execDate: '2026-04-29' }), conn, 1);
            expect(query).toHaveBeenNthCalledWith(1, 'SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
            expect(query).toHaveBeenNthCalledWith(4, 'SHOW WARNINGS');
            expect(warn.mock.calls).toEqual([
                [expect.any(String), { code: 1265, column: 'OperationType', fileOperationNumber: 1 }],
                [expect.any(String), { code: 1292, column: null, fileOperationNumber: 1 }],
            ]);
            expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
            expect(conn.rollback).toHaveBeenCalledTimes(1);
            expect(conn.commit).not.toHaveBeenCalled();
            expect(conn.release).toHaveBeenCalledTimes(1);

            const retry = await controller.startUpload(file, 'test.xml');
            expect(await finishedJob(retry.jobId)).toMatchObject({ status: 'done' });
        } finally {
            log.mockRestore();
            warn.mockRestore();
        }
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

    function exportWith(...operations: Array<{ order: string; exec: string; type?: string; description?: string }>) {
        return Buffer.from(`<account-history><search><account>99990000000000000000000001</account>
            <date since="2030-05-01" to="2030-05-31"/></search><operations>${operations.map(operation => `
            <operation><order-date>${operation.order}</order-date><exec-date>${operation.exec}</exec-date>
            <type>${operation.type ?? 'Przelew na konto'}</type>
            <description>${operation.description ?? 'Rachunek nadawcy : 99990000000000000000000002 Tytuł : Przykład'}</description>
            <amount curr="PLN">${operation.type ? '-' : ''}123.45</amount></operation>`).join('')}
            </operations></account-history>`);
    }

    function withPeriod(file: Buffer, periodFrom: string, periodTo: string) {
        return Buffer.from(file.toString('utf8').replace(/since="[^"]+" to="[^"]+"/, `since="${periodFrom}" to="${periodTo}"`));
    }

    function storedFrom(file: Buffer, firstId = 99) {
        const { operations, periodFrom, periodTo } = PkoBpXmlParser.parse(file);
        return operations.map((op, index) => ({ ...op, id: firstId + index, periodFrom, periodTo, confirmedThrough: periodTo }));
    }

    test('updates a shifted operation with the parser hash and keeps its existing allocation', async () => {
        const early = exportWith({ order: '2030-05-10', exec: '2030-05-10' });
        const oldFile = withPeriod(early, '2030-05-01', '2030-05-10');
        const newFile = exportWith({ order: '2030-05-12', exec: '2030-05-12' });
        let [existing] = storedFrom(oldFile);
        const allocationRepo = (controller as any).allocationRepo as jest.Mocked<PaymentAllocationRepository>;
        const invoiceRepo = (controller as any).invoiceRepo as jest.Mocked<InvoiceRepository>;
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.findImportOperations.mockImplementation(async () => [existing]);
        mockTransferRepo.updateImportedOperation.mockImplementation(async (id, operation, period) => {
            existing = { ...operation, ...period, id, confirmedThrough: period.periodTo };
        });
        allocationRepo.findSalesInvoiceIdsForTransfer.mockResolvedValue([73]);
        invoiceRepo.lockPaymentInvoice.mockResolvedValue({
            constructor: { name: 'RowDataPacket' },
            Number: '1/2030', Status: Setup.InvoiceStatus.PAID, CorrectedInvoiceId: null,
            PaidManually: 0, StatusBeforePayment: null,
        });

        await expect(controller.upload(newFile, 'later.xml')).resolves.toMatchObject({ total: 0, alreadyKnown: 1, needsReview: 0 });
        const expected = PkoBpXmlParser.parse(newFile).operations[0];
        expect(mockTransferRepo.updateImportedOperation).toHaveBeenCalledWith(
            99, expected, { periodFrom: '2030-05-01', periodTo: '2030-05-31' }, expect.anything(),
        );
        expect(allocationRepo.findSalesInvoiceIdsForTransfer).toHaveBeenCalledWith(99, expect.anything());
        expect(recalculatePayment).toHaveBeenCalledWith(73, expect.anything());
        expect(allocationRepo.insert).not.toHaveBeenCalled();
        expect(allocationRepo.delete).not.toHaveBeenCalled();
        expect(mockTransferRepo.updateMatchingStatus).not.toHaveBeenCalled();
        await expect(controller.upload(Buffer.concat([newFile, Buffer.from('\n')]), 'reexport.xml'))
            .resolves.toMatchObject({ total: 0, alreadyKnown: 1, needsReview: 0 });
        const intermediate = withPeriod(early, '2030-05-01', '2030-05-20');
        await expect(controller.upload(intermediate, 'older-after-correction.xml'))
            .resolves.toMatchObject({ total: 0, alreadyKnown: 1, needsReview: 0 });
        expect(mockTransferRepo.updateImportedOperation).toHaveBeenCalledTimes(1);
        expect(recalculatePayment).toHaveBeenCalledTimes(1);
        expect(mockTransferRepo.insert).not.toHaveBeenCalled();
    });

    test.each(['2030-05-11', '2030-05-31'])('recognizes earlier data with period end %s without rewriting the posted transfer', async periodTo => {
        const posted = exportWith({ order: '2030-05-12', exec: '2030-05-12' });
        const early = withPeriod(exportWith({ order: '2030-05-10', exec: '2030-05-10' }), '2030-05-01', periodTo);
        const allocationRepo = (controller as any).allocationRepo as jest.Mocked<PaymentAllocationRepository>;
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.findImportOperations.mockResolvedValue(storedFrom(posted));

        for (const file of [early, Buffer.concat([early, Buffer.from('\n')]), posted]) {
            await expect(controller.upload(file, 'known.xml'))
                .resolves.toMatchObject({ total: 0, alreadyKnown: 1, needsReview: 0 });
        }
        expect(mockTransferRepo.updateImportedOperation).not.toHaveBeenCalled();
        expect(mockTransferRepo.insert).not.toHaveBeenCalled();
        expect(mockTransferRepo.confirmImportPeriod).not.toHaveBeenCalled();
        expect(allocationRepo.findSalesInvoiceIdsForTransfer).not.toHaveBeenCalled();
        expect(recalculatePayment).not.toHaveBeenCalled();
    });

    test('an exact match from a later period also protects the transfer against an intermediate export', async () => {
        const confirmed = exportWith({ order: '2030-05-10', exec: '2030-05-10' });
        const [existing] = storedFrom(withPeriod(confirmed, '2030-05-01', '2030-05-10'));
        const intermediate = withPeriod(
            exportWith({ order: '2030-05-11', exec: '2030-05-11' }), '2030-05-01', '2030-05-20',
        );
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.findImportOperations.mockResolvedValue([existing]);
        mockTransferRepo.confirmImportPeriod.mockImplementation(async (_ids, periodTo) => {
            existing.confirmedThrough = periodTo;
        });

        await expect(controller.upload(confirmed, 'confirmed.xml'))
            .resolves.toMatchObject({ total: 0, alreadyKnown: 1, needsReview: 0 });
        expect(mockTransferRepo.confirmImportPeriod)
            .toHaveBeenCalledWith([existing.id], '2030-05-31', expect.anything());
        await expect(controller.upload(intermediate, 'intermediate.xml'))
            .resolves.toMatchObject({ total: 0, alreadyKnown: 1, needsReview: 0 });
        expect(mockTransferRepo.updateImportedOperation).not.toHaveBeenCalled();
        expect(mockTransferRepo.insert).not.toHaveBeenCalled();
        expect(recalculatePayment).not.toHaveBeenCalled();
    });

    test.each([null, '[]'])('keeps an exact-match MANUAL inflow restorable and out of duplicates with candidates %s', async candidates => {
        const { default: Repository } = jest.requireActual<typeof import('../BankTransferRepository')>(
            '../BankTransferRepository',
        );
        const repository = new Repository();
        const file = exportWith({ order: '2030-05-10', exec: '2030-05-10' });
        const [stored] = storedFrom(withPeriod(file, '2030-05-01', '2030-05-10'));
        const row = {
            constructor: { name: 'RowDataPacket' as const },
            Id: stored.id, BankStatementId: 11, ExecDate: stored.execDate, OperationHash: stored.operationHash,
            OperationType: stored.operationType, Direction: stored.direction, Amount: stored.amount, Currency: stored.currency,
            CounterpartyAccount: stored.counterpartyAccount, MatchingStatus: 'MANUAL', MatchingCandidates: candidates,
            ReviewAsPayment: 0, ImportNeedsReview: 0, HasAllocations: 0,
        };
        const query = jest.mocked(ToolsDb.getQueryCallbackAsync);
        query.mockResolvedValueOnce([row])
            .mockResolvedValueOnce([{ ...row, Id: 100, MatchingStatus: 'UNMATCHED' }])
            .mockResolvedValueOnce([row]);
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.findImportOperations.mockResolvedValue([stored]);
        mockTransferRepo.confirmImportPeriod.mockImplementation(repository.confirmImportPeriod.bind(repository));
        mockTransferRepo.findForDuplicateCheck.mockImplementation(repository.findForDuplicateCheck.bind(repository));
        mockTransferRepo.findById.mockImplementation(repository.findById.bind(repository));
        const allocationRepo = (controller as any).allocationRepo as jest.Mocked<PaymentAllocationRepository>;
        allocationRepo.findByTransferId.mockResolvedValue([]);

        await expect(controller.upload(file, 'later-confirmation.xml')).resolves.toMatchObject({ total: 0, alreadyKnown: 1 });
        const [, , conn] = mockTransferRepo.confirmImportPeriod.mock.calls[0];
        expect(conn.query).toHaveBeenCalledWith(
            expect.stringMatching(/SET VersionConfirmedThrough = \?\s+WHERE Id IN/), ['2030-05-31', [stored.id]],
        );
        await expect(repository.find()).resolves.toMatchObject([{ canRestoreToQueue: true, matchingStatus: 'MANUAL' }]);
        await expect(controller.getDuplicates()).resolves.toEqual([]);
        expect(query.mock.calls[1][0]).toContain("MatchingStatus <> 'MANUAL' OR JSON_LENGTH(MatchingCandidates) > 0");
        await expect(controller.restoreIncomingTransfer(stored.id)).resolves.toBeUndefined();
        expect(mockTransferRepo.updateMatchingStatus).toHaveBeenCalledWith(
            stored.id, 'UNMATCHED', null, null, expect.anything(), true,
        );
    });

    test('keeps identical card payments on different order days as two operations', async () => {
        const card = { type: 'Płatność kartą', description: 'Sklep testowy' };
        const first = { ...card, order: '2030-05-11', exec: '2030-05-13' };
        const second = { ...card, order: '2030-05-10', exec: '2030-05-12' };
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.findImportOperations.mockResolvedValue(storedFrom(exportWith(first), 19));

        await expect(controller.upload(exportWith(second, first), 'cards.xml'))
            .resolves.toMatchObject({ total: 1, alreadyKnown: 1, needsReview: 0 });
        expect(mockTransferRepo.updateImportedOperation).not.toHaveBeenCalled();
        expect(mockTransferRepo.insert).toHaveBeenCalledTimes(1);
        expect(mockTransferRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ orderDate: second.order }), expect.anything(), 1);
    });

    test('keeps both same-day card payments booked across April and May in separate exports', async () => {
        const card = { type: 'Płatność kartą', order: '2030-04-29', description: 'Sklep testowy Numer karty : 1111' };
        const april = withPeriod(exportWith({ ...card, exec: '2030-04-30' }), '2030-04-01', '2030-04-30');
        const may = exportWith({ ...card, exec: '2030-05-01' });
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.findImportOperations.mockResolvedValue(storedFrom(april));
        mockMatcher.propose.mockReturnValue({
            status: 'CONFIRMED', score: 1, candidates: [], costInvoiceId: 73, allocatedAmount: 123.45,
        });

        await expect(controller.upload(may, 'may.xml'))
            .resolves.toMatchObject({ total: 1, alreadyKnown: 0, needsReview: 1, autoMatched: 0 });
        expect(mockTransferRepo.updateImportedOperation).not.toHaveBeenCalled();
        expect(mockTransferRepo.insert).toHaveBeenCalledWith(
            expect.objectContaining({ direction: 'OUT', execDate: '2030-05-01', importNeedsReview: true }),
            expect.anything(), 1,
        );
        expect((controller as any).allocationRepo.insert).not.toHaveBeenCalled();
    });

    test('keeps same-amount transfers with different invoice titles from one sender', async () => {
        const prefix = 'Rachunek nadawcy : 99990000000000000000000002 Tytuł : FV ';
        const first = exportWith({ order: '2030-05-10', exec: '2030-05-10', description: prefix + '1/2030' });
        const second = exportWith({ order: '2030-05-12', exec: '2030-05-12', description: prefix + '2/2030' });
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.findImportOperations.mockResolvedValue(storedFrom(first));

        await expect(controller.upload(second, 'another-payment.xml'))
            .resolves.toMatchObject({ total: 1, alreadyKnown: 0, needsReview: 0 });
        expect(mockTransferRepo.updateImportedOperation).not.toHaveBeenCalled();
    });

    test('reports a date-only match for review when its previous day is outside the file period', async () => {
        const first = withPeriod(exportWith({ order: '2030-05-10', exec: '2030-05-10' }), '2030-05-01', '2030-05-10');
        const second = exportWith({ order: '2030-05-12', exec: '2030-05-12' })
            .toString('utf8').replace('since="2030-05-01"', 'since="2030-05-12"');
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.findImportOperations.mockResolvedValue(storedFrom(first));

        await expect(controller.upload(Buffer.from(second), 'separate-day.xml'))
            .resolves.toMatchObject({ total: 1, alreadyKnown: 0, needsReview: 1 });
        expect(mockTransferRepo.updateImportedOperation).not.toHaveBeenCalled();
    });

    test.each([
        ['Dane zaksięgowane Lokalizacja : Adres : Łąkowa 71 Miasto : Testowo Kraj : Polska', 1],
        ['Dane zaksięgowane Lokalizacja : Adres : Polna 71 Miasto : Testowo Kraj : Polska', 0],
        ['Dane zaksięgowane Lokalizacja : Adres : Łąkowa 7/1 Miasto : Testowo Kraj : Polska', 0],
        ['Dane zaksięgowane Lokalizacja : Adres : Łąkowa 7 1 Miasto : Testowo Kraj : Polska', 0],
        ['Dane zaksięgowane Lokalizacja : Adres : Łąkowa 7–1 Miasto : Testowo Kraj : Polska', 0],
        ['Dane zaksięgowane Lokalizacja : Adres : Łąkowa 71 Miasto : Testowo Kraj : Polska Numer karty : 2222', 0],
    ])('uses the card location and number when the description changes', async (description, known) => {
        const card = { type: 'Płatność kartą', order: '2030-05-10' };
        const storedFile = exportWith({
            ...card,
            exec: '2030-05-12',
            description: 'Lokalizacja : Adres : LAKOWA 71 Miasto : TESTOWO Kraj : POLSKA Numer karty : 1111',
        });
        const file = exportWith({ ...card, exec: '2030-05-10', description });
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.findImportOperations.mockResolvedValue(storedFrom(storedFile, 23));

        await expect(controller.upload(file, 'cards.xml'))
            .resolves.toMatchObject({ total: 1 - known, alreadyKnown: known, needsReview: 0 });
    });

    test.each([
        [['2030-05-10', '2030-05-12'], ['2030-05-11']],
        [['2030-05-11'], ['2030-05-10', '2030-05-12']],
        [['2030-05-10', '2030-05-12'], ['2030/05/11']],
    ])('reports ambiguity with stored dates %j and file dates %j', async (storedDates, fileDates) => {
        const transfers = (dates: string[]) => exportWith(...dates.map(date => ({ order: date, exec: date })));
        mockStatementRepo.findByChecksum.mockResolvedValue(null);
        mockTransferRepo.findImportOperations.mockResolvedValue(
            storedFrom(transfers(storedDates), 1),
        );
        mockMatcher.propose.mockReturnValue({
            status: 'CONFIRMED', score: 1, candidates: [{ invoiceId: 73, score: 1 }], invoiceId: 73, allocatedAmount: 123.45,
        });

        const result = await controller.upload(transfers(fileDates), 'ambiguous.xml');
        expect(result).toMatchObject({
            total: fileDates.length, alreadyKnown: 0, needsReview: fileDates.length, proposed: 0,
        });
        expect(result.reviewOperations.map(op => [op.fileOperationNumber, op.execDate]))
            .toEqual(fileDates.map((date, index) => [index + 1, date.replace(/\//g, '-')]));
        expect(mockTransferRepo.updateImportedOperation).not.toHaveBeenCalled();
        expect(mockTransferRepo.insert).toHaveBeenCalledTimes(fileDates.length);
        for (const [transfer] of mockTransferRepo.insert.mock.calls) {
            expect(transfer).toMatchObject({ matchingStatus: 'UNMATCHED', importNeedsReview: true });
        }
        expect((controller as any).allocationRepo.insert).not.toHaveBeenCalled();
    });

    test('reports the uncovered period after the statement has been inserted', async () => {
        mockStatementRepo.findPeriods.mockResolvedValue([
            { periodFrom: '2025-01-01', periodTo: '2026-02-28' },
            { periodFrom: '2026-04-01', periodTo: '2099-04-30' },
        ]);
        await expect(controller.upload(Buffer.from(SAMPLE_XML), 'test.xml')).resolves.toMatchObject({
            expenses: 1, incomePending: 0,
            gaps: [{ periodFrom: '2026-03-01', periodTo: '2026-03-31' }],
        });
    });

    test('a statement for another account does not fill a gap', async () => {
        jest.spyOn(controller as any, 'today').mockReturnValue('2026-08-14');
        const statement = { fileName: 'test.xml', importedAt: '', importedByName: null, newOperations: 0, pendingTransfers: 0 };
        mockStatementRepo.find.mockResolvedValue([
            { ...statement, id: 1, accountNumber: 'A', periodFrom: '2026-06-01', periodTo: '2026-06-30' },
            { ...statement, id: 2, accountNumber: 'B', periodFrom: '2026-07-01', periodTo: '2026-07-31' },
            { ...statement, id: 3, accountNumber: 'A', periodFrom: '2026-08-01', periodTo: '2026-08-14' },
        ]);
        const accounts = await controller.listStatements();
        expect(accounts.find(account => account.accountNumber === 'A')?.gaps)
            .toEqual([{ periodFrom: '2026-07-01', periodTo: '2026-07-31' }]);
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
            1,
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

        expect(first).toMatchObject({ allocatedAmount: 100, transferRemaining: 50, newPaymentStatus: paymentStatuses.PAID });
        expect(second).toMatchObject({ allocatedAmount: 50, transferRemaining: 0, newPaymentStatus: paymentStatuses.PARTIALLY_PAID });
        await expect(controller.createAllocation(1, { invoiceId: 12, amount: 1 }))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(invoiceRepo.lockPaymentCandidate).toHaveBeenCalledWith(10, expect.anything());
        expect(allocationRepo.insert).toHaveBeenCalledTimes(2);
    });

    test('rejects a second decision made against the same initial transfer amount', async () => {
        await controller.createAllocation(1, { invoiceId: 10, amount: 150, expectedRemaining: 150 });
        await expect(controller.createAllocation(1, { invoiceId: 11, amount: 150, expectedRemaining: 150 }))
            .rejects.toMatchObject({ statusCode: 409 });
        expect(allocationRepo.insert).toHaveBeenCalledTimes(1);
    });

    test('restores an incoming transfer classified as own without assigning a payment', async () => {
        transfer.matchingStatus = 'MANUAL';
        transfer.counterpartyAccount = Setup.Bank.ownAccounts[0];
        allocationRepo.findByTransferId.mockResolvedValue([]);
        await controller.restoreIncomingTransfer(1);

        expect(transferRepo.updateMatchingStatus).toHaveBeenCalledWith(
            1, 'UNMATCHED', null, null, expect.anything(), true,
        );
        expect(allocationRepo.insert).not.toHaveBeenCalled();
    });

    test('refuses to restore a transfer with any allocation, even an old zero-amount row', async () => {
        transfer.matchingStatus = 'MANUAL';
        allocationRepo.findByTransferId.mockResolvedValue([new PaymentAllocation({
            bankTransferId: 1, invoiceId: 10, allocatedAmount: 0, allocatedPercentage: 0, source: 'MANUAL',
        })]);

        await expect(controller.restoreIncomingTransfer(1)).rejects.toMatchObject({ statusCode: 409 });
        expect(transferRepo.updateMatchingStatus).not.toHaveBeenCalled();
    });

    test('asks the user to restore a manual transfer before assigning it', async () => {
        transfer.matchingStatus = 'MANUAL';
        await expect(controller.createAllocation(1, { invoiceId: 10, amount: 150 }))
            .rejects.toThrow('Przywróć do kolejki');
        expect(allocationRepo.insert).not.toHaveBeenCalled();
    });

    test('shows fresh proposals for a restored own transfer without assigning it', async () => {
        const matcher = (controller as any).matcher as TransferMatcher;
        const { TransferMatcher: RealTransferMatcher } = jest.requireActual<typeof import('../matching/TransferMatcher')>(
            '../matching/TransferMatcher',
        );
        const realMatcher = new RealTransferMatcher();
        jest.mocked(matcher.propose).mockImplementation(realMatcher.propose.bind(realMatcher));
        jest.mocked(matcher.loadCandidates).mockResolvedValue({
            invoices: [{
                Id: 10, InvoiceNumber: '10/2026', IssueDate: '2026-11-01', PaymentDeadline: '2026-11-25',
                DueAmount: 150, AllocatedAmount: 0, EntityTaxNumber: null, EntityBankAccount: null, EntityName: null,
            }],
            costInvoices: [],
        });
        Object.assign(transfer, {
            title: 'FV 10/2026', counterpartyAccount: Setup.Bank.ownAccounts[0],
            matchingStatus: 'UNMATCHED', reviewAsPayment: true, remainingAmount: 150,
        });
        transferRepo.findPending.mockResolvedValue([transfer as BankTransfer & { remainingAmount: number }]);
        await expect(controller.getPendingTransfers()).resolves.toMatchObject([{
            id: 1, matchingStatus: 'PROPOSED', matchingCandidates: [{ invoiceId: 10 }],
        }]);
        expect(allocationRepo.insert).not.toHaveBeenCalled();
    });

    test('returns the stored button marker with the original invoice payment details', async () => {
        invoiceRepo.findPaymentMarker.mockResolvedValue(Setup.InvoicePaidMarker.BUTTON);
        allocationRepo.findInvoicePayments.mockResolvedValue([]);
        await expect(controller.getInvoicePayments(10)).resolves.toEqual({ dueAmount: 100, paidManually: 2, payments: [] });
    });

    test('does not return an original invoice amount for a correction document', async () => {
        invoiceRepo.findPaymentMarker.mockResolvedValue(null);
        await expect(controller.getInvoicePayments(11)).rejects.toMatchObject({ statusCode: 404 });
        expect(allocationRepo.findInvoicePayments).not.toHaveBeenCalled();
    });

    test('shows the remainder of an old transfer with freshly computed candidates', async () => {
        const matcher = (controller as any).matcher as jest.Mocked<TransferMatcher>;
        transfer.matchingStatus = 'CONFIRMED';
        transfer.matchingCandidates = null;
        transferRepo.findPending.mockResolvedValue([Object.assign(transfer, { remainingAmount: 50 })]);
        matcher.propose.mockReturnValue({ status: 'PROPOSED', score: 0.7, candidates: [
            { invoiceId: 11, score: 0.7 }, { invoiceId: 12, score: 0.7 }, { invoiceId: 13, score: 0.5 },
        ] });
        await expect(controller.getPendingTransfers()).resolves.toMatchObject([{
            id: 1, amount: 150, remainingAmount: 50, matchingStatus: 'PROPOSED',
            matchingCandidates: [{ invoiceId: 11 }, { invoiceId: 12 }],
        }]);
        expect(matcher.propose).toHaveBeenCalledWith(expect.objectContaining({ amount: 50 }), undefined);
    });

    test.each([
        'zwr.wadium -NP/321/13/2026',
        'Zwrot mylnego przelewu',
    ])('keeps %s out of the invoice queue unless the user restored it', async (title) => {
        const matcher = (controller as any).matcher as jest.Mocked<TransferMatcher>;
        matcher.propose.mockReturnValue({ status: 'PROPOSED', score: 0.6, candidates: [{ invoiceId: 11, score: 0.6 }] });
        Object.assign(transfer, { title, matchingStatus: 'UNMATCHED', remainingAmount: 150 });
        transferRepo.findPending.mockResolvedValue([transfer as BankTransfer & { remainingAmount: number }]);
        await expect(controller.getPendingTransfers()).resolves.toEqual([]);
        expect(matcher.propose).not.toHaveBeenCalled();

        transfer.reviewAsPayment = true;
        await expect(controller.getPendingTransfers()).resolves.toMatchObject([{ id: 1, matchingStatus: 'PROPOSED' }]);
    });

    test('keeps cash-machine cancellations and a one-grosz rounding remainder out of the invoice queue', async () => {
        const matcher = (controller as any).matcher as jest.Mocked<TransferMatcher>;
        matcher.propose.mockReturnValue({ status: 'PROPOSED', score: 0.6, candidates: [{ invoiceId: 11, score: 0.6 }] });
        const cancelled = Object.assign(new BankTransfer({ ...transfer, id: 2, operationType: 'Anulowanie wypłaty w bankomacie - kod mobilny' }),
            { remainingAmount: 150 });
        const rounding = Object.assign(new BankTransfer({ ...transfer, id: 3, amount: 40000 }), { remainingAmount: 0.01 });
        transferRepo.findPending.mockResolvedValue([cancelled, rounding] as Array<BankTransfer & { remainingAmount: number }>);
        await expect(controller.getPendingTransfers()).resolves.toEqual([]);
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

    test('keeps a dismissed transfer outside the queue after detaching its last allocation', async () => {
        mockAllocationRepo.findById.mockResolvedValue(makeAlloc());
        mockAllocationRepo.findByTransferId.mockResolvedValue([]);
        mockTransferRepo.findById.mockResolvedValue({ matchingStatus: 'MANUAL' } as BankTransfer);
        await controller.deleteAllocation(10);
        expect(mockTransferRepo.updateMatchingStatus).not.toHaveBeenCalled();
    });
});
