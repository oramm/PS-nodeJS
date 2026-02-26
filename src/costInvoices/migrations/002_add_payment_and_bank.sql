-- =====================================================
-- Migracja 002: Dodanie numeru rachunku bankowego
-- i statusu płatności do faktur kosztowych
-- =====================================================

ALTER TABLE CostInvoices
    ADD COLUMN SupplierBankAccount VARCHAR(50) NULL AFTER SupplierAddress,
    ADD COLUMN PaymentStatus VARCHAR(20) NOT NULL DEFAULT 'UNPAID' AFTER Status,
    ADD COLUMN PaidAmount DECIMAL(15,2) NOT NULL DEFAULT 0 AFTER PaymentStatus;

CREATE INDEX idx_payment_status ON CostInvoices (PaymentStatus);
