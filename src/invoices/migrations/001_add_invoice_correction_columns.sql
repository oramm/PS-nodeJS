-- Migracja: Pola korekt faktur w tabeli Invoices
-- Data: 2026-02-13
-- Cel: Obsługa relacji faktura korygująca -> faktura oryginalna oraz przyczyny korekty

ALTER TABLE Invoices
    ADD COLUMN IF NOT EXISTS CorrectedInvoiceId INT NULL COMMENT 'ID faktury oryginalnej, jeśli rekord jest korektą',
    ADD COLUMN IF NOT EXISTS CorrectionReason TEXT NULL COMMENT 'Przyczyna korekty faktury';
