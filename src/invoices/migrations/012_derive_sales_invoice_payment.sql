ALTER TABLE Invoices
    ADD COLUMN IF NOT EXISTS PaidManually TINYINT UNSIGNED NOT NULL DEFAULT 0
        COMMENT '0 = none, 1 = before system, 2 = paid button',
    ADD COLUMN IF NOT EXISTS StatusBeforePayment VARCHAR(40) NULL;

UPDATE Invoices
SET PaidManually = 1, PaymentStatus = 'PAID'
WHERE Status = 'Zapłacona' AND CorrectedInvoiceId IS NULL
  AND StatusBeforePayment IS NULL AND PaidManually = 0;
