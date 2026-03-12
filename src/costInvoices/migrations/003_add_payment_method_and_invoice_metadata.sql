-- =====================================================
-- Migracja 003: Dodanie formy platnosci i metadanych faktury
-- =====================================================

ALTER TABLE CostInvoices
    ADD COLUMN PaymentMethod VARCHAR(100) NULL AFTER DueDate,
    ADD COLUMN InvoiceType VARCHAR(32) NULL AFTER PaymentMethod,
    ADD COLUMN PaymentDate DATE NULL AFTER InvoiceType;
