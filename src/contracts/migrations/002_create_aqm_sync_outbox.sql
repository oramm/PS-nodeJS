-- Migration: AQM sync outbox (WS10 — PS ENVI → AQM contract push)
-- Date: 2026-06-25
-- Scope: durable outbox for pushing "AQM"-type contracts to AQM 3.0.
--        Rows are written in the SAME transaction as the contract (L8);
--        a drainer attempts delivery post-commit and on interval.
-- NOTE: this file is authored only. Applying it is PARKED (owner-gated
--       env-with-DB session) — the reachable PS MySQL is production-ish.

CREATE TABLE IF NOT EXISTS AqmSyncOutbox (
    Id INT NOT NULL AUTO_INCREMENT,
    ContractId INT NOT NULL,
    Payload JSON NOT NULL,
    Status ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    Attempts INT NOT NULL DEFAULT 0,
    LastError TEXT NULL,
    CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (Id),
    INDEX idx_aqm_sync_outbox_status (Status),
    INDEX idx_aqm_sync_outbox_contract_id (ContractId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Outbox for PS ENVI -> AQM contract push (WS10, L8 reliability)';
