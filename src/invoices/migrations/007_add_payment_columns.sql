-- Migration: Add payment status fields to Invoices table
-- Analogous to CostInvoices payment fields

ALTER TABLE Invoices
    ADD COLUMN PaymentStatus VARCHAR(20) NOT NULL DEFAULT 'UNPAID'
        COMMENT 'UNPAID | PARTIALLY_PAID | PAID | NOT_APPLICABLE',
    ADD COLUMN PaidAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
    ADD COLUMN PaymentDate DATE NULL;
