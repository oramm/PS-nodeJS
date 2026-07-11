-- Migration: FIDman sync outbox (SYNC-P1 — PS ENVI → FIDman sync)
-- Date: 2026-07-11
-- Scope: durable outbox for pushing TypeId ∈ {3,4} contracts (and their
--        Entity-party / parent-Project updates) to FIDman `POST /api/ps-sync`.
--        Rows are written in the SAME transaction as the business write (L8);
--        a drainer attempts delivery post-commit and on interval.
--        SEPARATE target from AqmSyncOutbox — shared drainer *code*, not rows.
-- NOTE: authored only. Applying it is PARKED (owner-gated env-with-DB session),
--       modeled on 002_create_aqm_sync_outbox.sql.

CREATE TABLE IF NOT EXISTS FidmanSyncOutbox (
    Id INT NOT NULL AUTO_INCREMENT,
    -- Which upsert this row carries (FIDman ingest `kind`).
    Kind ENUM('contract.upsert', 'entity.upsert', 'project.upsert') NOT NULL,
    -- PS legacy PK the row is about (Contract/Entity/Project Id) — dedup/trace key.
    RefId INT NOT NULL,
    Payload JSON NOT NULL,
    -- SKIPPED = FIDman accepted the call but could not apply it; the row "needs a
    -- manual push" after the source data is fixed (see SkipReason). It is NOT a
    -- transport failure, so the drainer leaves SKIPPED rows alone.
    Status ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    -- FIDman skip reason for a SKIPPED row: 'NEEDS_DATA' | 'NO_NIP' (read in P2).
    SkipReason VARCHAR(32) NULL,
    Attempts INT NOT NULL DEFAULT 0,
    LastError TEXT NULL,
    CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (Id),
    INDEX idx_fidman_sync_outbox_status (Status),
    INDEX idx_fidman_sync_outbox_kind_ref (Kind, RefId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Outbox for PS ENVI -> FIDman sync (SYNC-P1, L8 reliability)';
