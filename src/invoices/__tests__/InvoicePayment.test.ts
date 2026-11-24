jest.mock('../../tools/ToolsDb', () => ({
    __esModule: true,
    default: { transaction: jest.fn() },
}));
jest.mock('../InvoiceRepository');
jest.mock('../../bankSync/PaymentAllocationRepository');

import mysql from 'mysql2/promise';
import Invoice from '../Invoice';
import InvoiceItemsController from '../InvoiceItemsController';
import InvoiceValidator from '../InvoiceValidator';
import InvoicesController from '../InvoicesController';
import InvoiceRepository from '../InvoiceRepository';
import PaymentAllocationRepository from '../../bankSync/PaymentAllocationRepository';
import Setup from '../../setup/Setup';
import ToolsDb from '../../tools/ToolsDb';
import { SystemRoleName, UserData } from '../../types/sessionTypes';

const status = Setup.InvoiceStatus;
const payment = Setup.InvoicePaymentStatus;
const marker = Setup.InvoicePaidMarker;
const conn = {} as mysql.PoolConnection;

describe('InvoicesController payment', () => {
    let repository: jest.Mocked<InvoiceRepository>;
    let allocations: jest.Mocked<PaymentAllocationRepository>;
    let invoice: NonNullable<Awaited<ReturnType<InvoiceRepository['lockPaymentInvoice']>>>;

    beforeEach(() => {
        jest.clearAllMocks();
        const instance = (InvoicesController as any).getInstance();
        repository = instance.repository;
        allocations = instance.allocationRepository;
        invoice = {
            Status: status.SENT_TO_KSEF, CorrectedInvoiceId: null,
            PaidManually: marker.NONE, StatusBeforePayment: null,
        } as typeof invoice;
        repository.lockPaymentInvoice.mockResolvedValue(invoice);
        repository.findDueAmount.mockResolvedValue(6150);
        repository.updatePayment.mockImplementation(async (_, state) => {
            invoice.Status = state.status;
            invoice.PaidManually = state.paidMarker;
            invoice.StatusBeforePayment = state.statusBeforePayment;
        });
        allocations.getInvoicePayment.mockResolvedValue({ paidAmount: 0, paymentDate: null });
        jest.mocked(ToolsDb.transaction).mockImplementation(async (callback) => callback(conn));
    });

    const storedState = () => repository.updatePayment.mock.lastCall?.[1];

    test('keeps the lifecycle status on a partial payment and sets it on the final instalment', async () => {
        allocations.getInvoicePayment.mockResolvedValueOnce({ paidAmount: 5000, paymentDate: '2026-11-12' });
        await InvoicesController.recalculatePayment(1, conn);
        expect(storedState()).toMatchObject({
            paymentStatus: payment.PARTIALLY_PAID, status: status.SENT_TO_KSEF,
            paidAmount: 5000, paymentDate: '2026-11-12', statusBeforePayment: null,
        });

        allocations.getInvoicePayment.mockResolvedValueOnce({ paidAmount: 6150, paymentDate: '2026-11-18' });
        await InvoicesController.recalculatePayment(1, conn);
        expect(storedState()).toEqual({
            paymentStatus: payment.PAID, status: status.PAID, paidAmount: 6150, paymentDate: '2026-11-18',
            statusBeforePayment: status.SENT_TO_KSEF, paidMarker: marker.NONE,
        });
    });

    test('uses the family amount on the original and restores Corrected when full coverage is removed', async () => {
        invoice.Status = status.CORRECTED;
        repository.findDueAmount.mockResolvedValue(53876.73);
        allocations.getInvoicePayment.mockResolvedValueOnce({ paidAmount: 53876.73, paymentDate: '2026-11-20' });
        await InvoicesController.recalculatePayment(212, conn);
        expect(storedState()).toMatchObject({
            status: status.PAID, paymentStatus: payment.PAID, statusBeforePayment: status.CORRECTED,
        });
        expect(repository.updatePayment.mock.lastCall?.[0]).toBe(212);

        allocations.getInvoicePayment.mockResolvedValueOnce({ paidAmount: 13692.24, paymentDate: '2026-11-10' });
        await InvoicesController.recalculatePayment(212, conn);
        expect(storedState()).toMatchObject({
            status: status.CORRECTED, paymentStatus: payment.PARTIALLY_PAID,
            paymentDate: '2026-11-10', statusBeforePayment: null,
        });
    });

    test.each([
        ['an in-minus correction', 'custom', true, 900, status.CORRECTED, status.PAID],
        ['a zero correction in KSeF', 'zero', true, 0, status.CORRECTED, status.PAID],
        ['a zero correction before KSeF', 'zero', false, 0, status.WITHDRAWN, status.WITHDRAWN],
    ] as const)('recalculates the original after issuing %s', async (_, correctionType, sentToKsef, due, issuedStatus, finalStatus) => {
        const userData: UserData = {
            enviId: 1, userName: 'Fixture', systemEmail: 'fixture@example.invalid',
            picture: '', systemRoleName: SystemRoleName.ADMIN, systemRoleId: 1,
        };
        const original = {
            id: 1, status: status.PAID, number: '10/2026', issueDate: '2026-11-01',
            daysToPay: 14, ksefNumber: sentToKsef ? 'fixture-ksef' : null,
            _contract: { id: 1, ourId: 'FIXTURE', _type: { id: 1, name: 'Fixture' } },
        } as Invoice;
        invoice.Status = status.PAID;
        invoice.StatusBeforePayment = sentToKsef ? status.SENT_TO_KSEF : status.SENT;
        repository.find.mockResolvedValue([original]);
        repository.findCorrections.mockResolvedValue([]);
        repository.addInDb.mockImplementation(async (addedInvoice) => { addedInvoice.id = 2; });
        repository.editInDb.mockImplementation(async (editedInvoice) => { invoice.Status = editedInvoice.status; });
        jest.spyOn(InvoiceValidator.prototype, 'checkValueWithContract').mockResolvedValue(true);
        jest.spyOn(InvoiceItemsController, 'find').mockResolvedValue([
            { description: 'Pozycja', quantity: 1, unitPrice: 1000, vatTax: 0 },
        ] as Awaited<ReturnType<typeof InvoiceItemsController.find>>);
        const addItem = jest.spyOn(InvoiceItemsController, 'addNewInvoiceItem').mockImplementation(async () => {
            repository.findDueAmount.mockResolvedValue(due);
            return {} as Awaited<ReturnType<typeof InvoiceItemsController.addNewInvoiceItem>>;
        });
        allocations.getInvoicePayment.mockResolvedValue({ paidAmount: 1000, paymentDate: '2026-11-05' });
        const headerConn = {} as mysql.PoolConnection;
        jest.mocked(ToolsDb.transaction).mockImplementationOnce(async (callback) => callback(headerConn));

        const correction = await InvoicesController.createCorrectionInvoice(
            1, correctionType, 'Fixture', userData,
            [{ description: 'Korekta', quantity: 1, unitPrice: -100, vatTax: 0 }],
        );

        expect(correction.correctedInvoiceId).toBe(1);
        expect(addItem).toHaveBeenCalledTimes(1);
        expect(repository.editInDb).toHaveBeenCalledWith(expect.objectContaining({ status: issuedStatus }), conn, true, ['status']);
        expect(repository.findDueAmount).toHaveBeenCalledWith(1, conn);
        expect(repository.updatePayment).toHaveBeenCalledWith(1, expect.objectContaining({
            status: finalStatus, paymentStatus: payment.PAID, paidAmount: 1000, paymentDate: '2026-11-05',
            statusBeforePayment: sentToKsef ? status.CORRECTED : null,
        }), conn);
    });

    test('historical paid marker survives attachment and deletion of a transfer', async () => {
        invoice.Status = status.PAID;
        invoice.PaidManually = marker.BEFORE_SYSTEM;
        allocations.getInvoicePayment.mockResolvedValueOnce({ paidAmount: 6150, paymentDate: '2026-11-18' });
        await InvoicesController.recalculatePayment(1, conn);
        expect(storedState()).toMatchObject({
            status: status.PAID, paymentStatus: payment.PAID,
            paidMarker: marker.BEFORE_SYSTEM, paidAmount: 6150, paymentDate: '2026-11-18',
        });

        await InvoicesController.recalculatePayment(1, conn);
        expect(storedState()).toMatchObject({
            status: status.PAID, paymentStatus: payment.PAID,
            paidMarker: marker.BEFORE_SYSTEM, paidAmount: 0, paymentDate: null,
        });
    });

    test('the paid button stores the marker and shares the paid status with a full bank payment', async () => {
        await InvoicesController.markAsPaid(1);
        expect(storedState()).toEqual({
            status: status.PAID, paymentStatus: payment.PAID, statusBeforePayment: status.SENT_TO_KSEF,
            paidMarker: marker.BUTTON, paidAmount: 0, paymentDate: null,
        });
        expect(allocations.insert).not.toHaveBeenCalled();
    });

    test('a retried paid button does not turn an already confirmed bank payment into a permanent marker', async () => {
        invoice.Status = status.PAID;
        invoice.StatusBeforePayment = status.SENT;
        allocations.getInvoicePayment.mockResolvedValue({ paidAmount: 6150, paymentDate: '2026-11-18' });
        await InvoicesController.markAsPaid(1);
        expect(storedState()).toMatchObject({ paidMarker: marker.NONE, statusBeforePayment: status.SENT });

        allocations.getInvoicePayment.mockResolvedValue({ paidAmount: 0, paymentDate: null });
        await InvoicesController.recalculatePayment(1, conn);
        expect(storedState()).toMatchObject({ paymentStatus: payment.UNPAID, status: status.SENT, paymentDate: null });
    });

    test.each([
        [0, payment.UNPAID],
        [1000, payment.PARTIALLY_PAID],
        [6150, payment.PAID],
    ])('undoes the button marking and recalculates with %s from bank transfers', async (paidAmount, paymentStatus) => {
        await InvoicesController.markAsPaid(1);
        const paymentDate = paidAmount ? '2026-11-18' : null;
        allocations.getInvoicePayment.mockResolvedValue({ paidAmount, paymentDate });
        repository.findById.mockResolvedValue({ id: 1 } as Invoice);

        await expect(InvoicesController.undoManualPayment(1)).resolves.toMatchObject({ id: 1 });
        expect(storedState()).toMatchObject({
            paidMarker: marker.NONE, paidAmount, paymentDate, paymentStatus,
            status: paidAmount === 6150 ? status.PAID : status.SENT_TO_KSEF,
            statusBeforePayment: paidAmount === 6150 ? status.SENT_TO_KSEF : null,
        });
    });

    test.each([marker.NONE, marker.BEFORE_SYSTEM])('cannot undo the manual marker %s', async paidMarker => {
        invoice.PaidManually = paidMarker;
        await expect(InvoicesController.undoManualPayment(1)).resolves.toBeNull();
        expect(repository.updatePayment).not.toHaveBeenCalled();
    });

    test('a full payment replaces the button marker and detaching it restores the previous status', async () => {
        await InvoicesController.markAsPaid(1);
        allocations.getInvoicePayment.mockResolvedValueOnce({ paidAmount: 6150, paymentDate: '2026-11-18' });
        await InvoicesController.recalculatePayment(1, conn);
        expect(storedState()).toMatchObject({ paidMarker: marker.NONE, status: status.PAID });
        await InvoicesController.recalculatePayment(1, conn);
        expect(storedState()).toMatchObject({ paidMarker: marker.NONE, status: status.SENT_TO_KSEF });
    });

    test('does not mark a correction document as paid through the paid button', async () => {
        invoice.CorrectedInvoiceId = 1;
        await expect(InvoicesController.markAsPaid(2)).rejects.toThrow('faktury oryginalnej');
        expect(repository.updatePayment).not.toHaveBeenCalled();
    });

    test('the legacy PATCH cannot replace the calculated amount or clear the paid marker', async () => {
        invoice.Status = status.PAID;
        invoice.PaidManually = marker.BEFORE_SYSTEM;
        await expect(InvoicesController.updatePayment(1, { paymentStatus: payment.UNPAID }))
            .rejects.toThrow('przypisanych wpłat');
        await expect(InvoicesController.updatePayment(1, { paymentStatus: payment.PAID, paidAmount: 6150 }))
            .rejects.toThrow('przypisanych wpłat');
        expect(repository.updatePayment).not.toHaveBeenCalled();
    });
});
