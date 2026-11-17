-- SOURCE ONLY. Explicit environment approval required before execution.
-- Retained actor/request identity and append-only observations survive removal of source business rows.
CREATE TABLE MilestoneConsolidationFinalizations (
    OperationId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ActorId INT NOT NULL,
    RequestId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    StateJSON LONGTEXT NOT NULL,
    Revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    CreatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UpdatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (OperationId, ActorId, RequestId),
    UNIQUE KEY UX_Finalization_ActorRequest (ActorId, RequestId),
    CONSTRAINT CK_Finalization_JSON CHECK (JSON_VALID(StateJSON))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE MilestoneConsolidationOperations DROP CONSTRAINT CK_ConsolidationOperation_State;
ALTER TABLE MilestoneConsolidationOperations ADD CONSTRAINT CK_ConsolidationOperation_State
    CHECK (State IN ('TRANSFERRING','AWAITING_DRIVE_CLEANUP','FINALIZING','RECONCILIATION_REQUIRED','COMPLETED'));
-- Rollback: disable endpoints. Preserve journals, receipts, history and operations; do not DROP retained data.
