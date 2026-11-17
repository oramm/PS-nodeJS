-- Explicit approval required. No cascading FK: operation identity outlives source cleanup.
CREATE TABLE MilestoneConsolidationOperations (
    OperationId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    ProjectOurId VARCHAR(80) NOT NULL,
    SourceMilestoneId INT NOT NULL,
    DestinationMilestoneId INT NOT NULL,
    ActorId INT NOT NULL,
    State VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    SnapshotJSON LONGTEXT NOT NULL,
    CreatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    UpdatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    UNIQUE KEY UX_ConsolidationOperation_Source (SourceMilestoneId),
    CONSTRAINT CK_ConsolidationOperation_JSON CHECK (JSON_VALID(SnapshotJSON)),
    CONSTRAINT CK_ConsolidationOperation_State CHECK (State IN ('TRANSFERRING', 'AWAITING_DRIVE_CLEANUP', 'FINALIZING', 'COMPLETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Rollback: disable future execution and retain the table, never DROP operation history.
