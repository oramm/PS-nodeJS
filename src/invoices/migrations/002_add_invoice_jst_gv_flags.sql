-- Migracja: Flagi JST/GV dla faktur (mapowanie do pól Podmiot2.JST i Podmiot2.GV w KSeF)
-- Data: 2026-04-01

ALTER TABLE Invoices
    ADD COLUMN IF NOT EXISTS IsJstSubordinate TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Czy faktura dotyczy jednostki podrzędnej JST (false=0, true=1)',
    ADD COLUMN IF NOT EXISTS IsGvMember TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Czy faktura dotyczy członka grupy GV (false=0, true=1)';
