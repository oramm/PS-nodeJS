-- Migracja: Opcjonalny typ skutku korekty KSeF na fakturze
-- Data: 2026-04-08
-- Cel: Trwałe przechowywanie TypKorekty (1/2/3) dla faktur korygujących

ALTER TABLE Invoices
    ADD COLUMN IF NOT EXISTS KsefCorrectionType TINYINT NULL COMMENT 'Opcjonalny typ skutku korekty KSeF: 1, 2 lub 3';
