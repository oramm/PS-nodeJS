-- =====================================================
-- Migracja 004: Dodanie statusu weryfikacji Bialej Listy
-- (Wykaz podatnikow VAT, KAS wl-api) dla faktur kosztowych
-- =====================================================

ALTER TABLE CostInvoices
    ADD COLUMN WhiteListStatus VARCHAR(20) NOT NULL DEFAULT 'NOT_CHECKED' AFTER SupplierBankAccount,
    ADD COLUMN WhiteListRequestId VARCHAR(100) NULL AFTER WhiteListStatus,
    ADD COLUMN WhiteListCheckedAt DATETIME NULL AFTER WhiteListRequestId;

CREATE INDEX idx_white_list_status ON CostInvoices (WhiteListStatus);
