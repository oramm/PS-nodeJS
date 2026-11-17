-- Local apply requires explicit approval. Retain audit independently of business entities.
CREATE TABLE MilestoneConsolidationBatches (
    OperationId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ActorId INT NOT NULL,
    RequestId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PreviewId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ProjectOurId VARCHAR(80) NOT NULL,
    SourceMilestoneId INT NOT NULL,
    DestinationMilestoneId INT NOT NULL,
    BeforeRevision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ContentHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    SnapshotJSON LONGTEXT NOT NULL,
    CreatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (OperationId, ActorId, RequestId),
    UNIQUE KEY UX_ConsolidationBatch_Request (ActorId, RequestId),
    CONSTRAINT CK_ConsolidationBatch_JSON CHECK (JSON_VALID(SnapshotJSON))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Rollback: disable the future apply route; retain audit. No DROP or cascading business FK.
