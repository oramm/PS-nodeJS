-- Migracja: DM-L1 — trwały reverse link PS ENVI → FIDman.
-- Data: 2026-07-16
-- Zakres: kolumna Contracts.FidmanContractId = FIDman fidschm.contracts.id (PK↔PK).
--   Druga połowa linku: FIDman trzyma legacy_contract_id = PS Contracts.Id (już istnieje).
--   Podwójna rola (kanon notes/2026-07-16-dm1-mechanizm-importu-raty-ps-envi.md):
--     1. Najmocniejszy możliwy link — obie strony trzymają swój wzajemny PK.
--     2. Marker stanu synchro dla DM-C1: NULL = kontraktu NIE ma w nowym FIDmanie (kikut).
--   Wypełnianie: jednorazowy backfill (src/scripts/fidman-reverse-link-backfill.ts) TERAZ,
--   ack outboxa (FidmanSync.deliverOutboxRow) na przyszłość. Deploy owner-gated (kylos).
-- MariaDB 10.6 → ADD COLUMN / CREATE INDEX IF NOT EXISTS (wzorzec 001_add_letters_shortcuts).

ALTER TABLE Contracts
    ADD COLUMN IF NOT EXISTS FidmanContractId INT NULL
        COMMENT 'FIDman fidschm.contracts.id (reverse link, PK↔PK). NULL = brak w nowym FIDmanie (kikut).';

CREATE INDEX IF NOT EXISTS idx_contracts_fidman_contract_id ON Contracts (FidmanContractId);
