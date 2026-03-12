// Mock dependencies
jest.mock('../CostInvoiceRepository');

import CostInvoiceController from '../CostInvoiceController';
import CostInvoiceRepository from '../CostInvoiceRepository';
import CostInvoice from '../CostInvoice';

describe('CostInvoiceController - Payment Status Updates', () => {
    let controller: CostInvoiceController;
    let mockRepository: jest.Mocked<CostInvoiceRepository>;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new CostInvoiceController();
        mockRepository = (controller as any).repository;
    });

    describe('updateBookingSettings - payment fields', () => {
        it('POSITIVE: Should update paymentStatus=PARTIALLY_PAID with valid paidAmount', async () => {
            // Arrange
            const invoiceId = 1;
            const mockInvoice = new CostInvoice({
                id: invoiceId,
                ksefNumber: 'TEST-001',
                supplierName: 'Test Supplier',
                invoiceNumber: 'FV/2024/01',
                issueDate: new Date('2024-01-01'),
                netAmount: 1000,
                vatAmount: 230,
                grossAmount: 1230,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });
            mockInvoice._items = [];

            mockRepository.findById.mockResolvedValue(mockInvoice);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);
            mockRepository.update.mockResolvedValue(undefined);

            // Act
            const result = await controller.updateBookingSettings(invoiceId, {
                paymentStatus: 'PARTIALLY_PAID',
                paidAmount: 500,
            });

            // Assert
            expect(mockRepository.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentStatus: 'PARTIALLY_PAID',
                    paidAmount: 500,
                }),
                expect.arrayContaining(['paymentStatus', 'paidAmount'])
            );
            expect(result.paymentStatus).toBe('PARTIALLY_PAID');
            expect(result.paidAmount).toBe(500);
        });

        it('POSITIVE: Should auto-normalize paidAmount=0 when paymentStatus=UNPAID', async () => {
            // Arrange
            const invoiceId = 1;
            const mockInvoice = new CostInvoice({
                id: invoiceId,
                ksefNumber: 'TEST-002',
                supplierName: 'Test Supplier',
                invoiceNumber: 'FV/2024/02',
                issueDate: new Date('2024-01-01'),
                netAmount: 1000,
                vatAmount: 230,
                grossAmount: 1230,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'PARTIALLY_PAID',
                paidAmount: 500,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });
            mockInvoice._items = [];

            mockRepository.findById.mockResolvedValue(mockInvoice);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);
            mockRepository.update.mockResolvedValue(undefined);

            // Act
            const result = await controller.updateBookingSettings(invoiceId, {
                paymentStatus: 'UNPAID',
            });

            // Assert
            expect(mockRepository.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentStatus: 'UNPAID',
                    paidAmount: 0,
                }),
                expect.arrayContaining(['paymentStatus', 'paidAmount'])
            );
            expect(result.paymentStatus).toBe('UNPAID');
            expect(result.paidAmount).toBe(0);
        });

        it('POSITIVE: Should auto-normalize paidAmount=grossAmount when paymentStatus=PAID', async () => {
            // Arrange
            const invoiceId = 1;
            const mockInvoice = new CostInvoice({
                id: invoiceId,
                ksefNumber: 'TEST-003',
                supplierName: 'Test Supplier',
                invoiceNumber: 'FV/2024/03',
                issueDate: new Date('2024-01-01'),
                netAmount: 1000,
                vatAmount: 230,
                grossAmount: 1230,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });
            mockInvoice._items = [];

            mockRepository.findById.mockResolvedValue(mockInvoice);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);
            mockRepository.update.mockResolvedValue(undefined);

            // Act
            const result = await controller.updateBookingSettings(invoiceId, {
                paymentStatus: 'PAID',
            });

            // Assert
            expect(mockRepository.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentStatus: 'PAID',
                    paidAmount: 1230,
                }),
                expect.arrayContaining(['paymentStatus', 'paidAmount'])
            );
            expect(result.paymentStatus).toBe('PAID');
            expect(result.paidAmount).toBe(1230);
        });

        it('POSITIVE: Should auto-normalize paidAmount=0 when paymentStatus=NOT_APPLICABLE', async () => {
            const invoiceId = 1;
            const mockInvoice = new CostInvoice({
                id: invoiceId,
                ksefNumber: 'TEST-003A',
                supplierName: 'Test Supplier',
                invoiceNumber: 'FK/2024/03A',
                issueDate: new Date('2024-01-01'),
                netAmount: -120.33,
                vatAmount: -27.67,
                grossAmount: -148,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });
            mockInvoice._items = [];

            mockRepository.findById.mockResolvedValue(mockInvoice);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);
            mockRepository.update.mockResolvedValue(undefined);

            const result = await controller.updateBookingSettings(invoiceId, {
                paymentStatus: 'NOT_APPLICABLE',
            });

            expect(mockRepository.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    paymentStatus: 'NOT_APPLICABLE',
                    paidAmount: 0,
                }),
                expect.arrayContaining(['paymentStatus', 'paidAmount'])
            );
            expect(result.paymentStatus).toBe('NOT_APPLICABLE');
            expect(result.paidAmount).toBe(0);
        });

        it('NEGATIVE: Should reject invalid paymentStatus', async () => {
            // Arrange
            const invoiceId = 1;
            const mockInvoice = new CostInvoice({
                id: invoiceId,
                ksefNumber: 'TEST-004',
                supplierName: 'Test Supplier',
                invoiceNumber: 'FV/2024/04',
                issueDate: new Date('2024-01-01'),
                netAmount: 1000,
                vatAmount: 230,
                grossAmount: 1230,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });
            mockInvoice._items = [];

            mockRepository.findById.mockResolvedValue(mockInvoice);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);

            // Act & Assert
            await expect(
                controller.updateBookingSettings(invoiceId, {
                    paymentStatus: 'INVALID_STATUS' as any,
                })
            ).rejects.toThrow(/Nieprawidłowy status płatności/);
        });

        it('NEGATIVE: Should reject negative paidAmount', async () => {
            // Arrange
            const invoiceId = 1;
            const mockInvoice = new CostInvoice({
                id: invoiceId,
                ksefNumber: 'TEST-005',
                supplierName: 'Test Supplier',
                invoiceNumber: 'FV/2024/05',
                issueDate: new Date('2024-01-01'),
                netAmount: 1000,
                vatAmount: 230,
                grossAmount: 1230,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });
            mockInvoice._items = [];

            mockRepository.findById.mockResolvedValue(mockInvoice);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);

            // Act & Assert
            await expect(
                controller.updateBookingSettings(invoiceId, {
                    paidAmount: -100,
                })
            ).rejects.toThrow(/nie może być ujemna/);
        });

        it('NEGATIVE: Should reject paidAmount > grossAmount', async () => {
            // Arrange
            const invoiceId = 1;
            const mockInvoice = new CostInvoice({
                id: invoiceId,
                ksefNumber: 'TEST-006',
                supplierName: 'Test Supplier',
                invoiceNumber: 'FV/2024/06',
                issueDate: new Date('2024-01-01'),
                netAmount: 1000,
                vatAmount: 230,
                grossAmount: 1230,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });
            mockInvoice._items = [];

            mockRepository.findById.mockResolvedValue(mockInvoice);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);

            // Act & Assert
            await expect(
                controller.updateBookingSettings(invoiceId, {
                    paidAmount: 1500,
                })
            ).rejects.toThrow(/nie może przekroczyć kwoty brutto faktury/);
        });

        it('NEGATIVE: Should reject PARTIALLY_PAID with paidAmount=0', async () => {
            // Arrange
            const invoiceId = 1;
            const mockInvoice = new CostInvoice({
                id: invoiceId,
                ksefNumber: 'TEST-007',
                supplierName: 'Test Supplier',
                invoiceNumber: 'FV/2024/07',
                issueDate: new Date('2024-01-01'),
                netAmount: 1000,
                vatAmount: 230,
                grossAmount: 1230,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });
            mockInvoice._items = [];

            mockRepository.findById.mockResolvedValue(mockInvoice);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);

            // Act & Assert
            await expect(
                controller.updateBookingSettings(invoiceId, {
                    paymentStatus: 'PARTIALLY_PAID',
                    paidAmount: 0,
                })
            ).rejects.toThrow(/PARTIALLY_PAID wymaga paidAmount > 0/);
        });

        it('NEGATIVE: Should reject PARTIALLY_PAID with paidAmount >= grossAmount', async () => {
            // Arrange
            const invoiceId = 1;
            const mockInvoice = new CostInvoice({
                id: invoiceId,
                ksefNumber: 'TEST-008',
                supplierName: 'Test Supplier',
                invoiceNumber: 'FV/2024/08',
                issueDate: new Date('2024-01-01'),
                netAmount: 1000,
                vatAmount: 230,
                grossAmount: 1230,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });
            mockInvoice._items = [];

            mockRepository.findById.mockResolvedValue(mockInvoice);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);

            // Act & Assert
            await expect(
                controller.updateBookingSettings(invoiceId, {
                    paymentStatus: 'PARTIALLY_PAID',
                    paidAmount: 1230,
                })
            ).rejects.toThrow(/PARTIALLY_PAID wymaga paidAmount < grossAmount/);
        });

        it('NEGATIVE: Should reject NOT_APPLICABLE with paidAmount > 0', async () => {
            const invoiceId = 1;
            const mockInvoice = new CostInvoice({
                id: invoiceId,
                ksefNumber: 'TEST-008A',
                supplierName: 'Test Supplier',
                invoiceNumber: 'FK/2024/08A',
                issueDate: new Date('2024-01-01'),
                netAmount: -120.33,
                vatAmount: -27.67,
                grossAmount: -148,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'UNPAID',
                paidAmount: 0,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });
            mockInvoice._items = [];

            mockRepository.findById.mockResolvedValue(mockInvoice);
            mockRepository.findItemsByInvoiceId.mockResolvedValue([]);

            await expect(
                controller.updateBookingSettings(invoiceId, {
                    paymentStatus: 'NOT_APPLICABLE',
                    paidAmount: 1,
                })
            ).rejects.toThrow(/NOT_APPLICABLE wymaga paidAmount = 0/);
        });
    });

    describe('toJson - regression test for payment and bank fields', () => {
        it('Should return supplierBankAccount, paymentStatus, paidAmount, and dueDate in JSON', () => {
            // Arrange
            const invoice = new CostInvoice({
                id: 1,
                ksefNumber: 'TEST-009',
                supplierName: 'Test Supplier',
                supplierBankAccount: '12 3456 7890 1234 5678 9012 3456',
                invoiceNumber: 'FV/2024/09',
                issueDate: new Date('2024-01-01'),
                dueDate: new Date('2024-02-01'),
                netAmount: 1000,
                vatAmount: 230,
                grossAmount: 1230,
                currency: 'PLN',
                status: 'NEW',
                paymentStatus: 'PARTIALLY_PAID',
                paidAmount: 600,
                bookingPercentage: 100,
                vatDeductionPercentage: 100,
            });

            // Act
            const json = invoice.toJson();

            // Assert
            expect(json.supplierBankAccount).toBe('12 3456 7890 1234 5678 9012 3456');
            expect(json.paymentStatus).toBe('PARTIALLY_PAID');
            expect(json.paidAmount).toBe(600);
            expect(json.dueDate).toBe('2024-02-01');
        });
    });
});
