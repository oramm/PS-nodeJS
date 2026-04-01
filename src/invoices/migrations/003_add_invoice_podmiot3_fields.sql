-- Migration: Add Podmiot3 support fields for KSeF FA(3)
-- Date: 2026-04-01
-- Adds optional third-party mapping required by JST/GV business rules

ALTER TABLE Invoices
    ADD COLUMN IF NOT EXISTS IncludeThirdParty TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Czy emitować sekcję Podmiot3 w KSeF XML',
    ADD COLUMN IF NOT EXISTS ThirdPartyEntityId INT NULL COMMENT 'EntityId mapowany do Podmiot3';
