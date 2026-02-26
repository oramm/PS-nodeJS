-- =====================================================
-- Rollback migracji 002: Usunięcie numeru rachunku bankowego
-- i statusu płatności z faktur kosztowych
-- =====================================================

ALTER TABLE CostInvoices
    DROP INDEX idx_payment_status,
    DROP COLUMN PaidAmount,
    DROP COLUMN PaymentStatus,
    DROP COLUMN SupplierBankAccount;
