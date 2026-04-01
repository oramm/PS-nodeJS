-- Migration: Align GV default with Podmiot3 rules and legacy compatibility
-- Date: 2026-04-01

ALTER TABLE Invoices
    MODIFY COLUMN IsGvMember TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Czy faktura dotyczy członka grupy GV (false=0, true=1)';
