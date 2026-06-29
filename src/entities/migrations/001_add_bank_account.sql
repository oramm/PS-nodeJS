-- Migration: Add BankAccountNumber to Entities table
-- Used for matching incoming bank transfers to invoices

ALTER TABLE Entities
    ADD COLUMN BankAccountNumber VARCHAR(34) NULL
        COMMENT 'IBAN or 26-digit account number, used for bank transfer matching';
