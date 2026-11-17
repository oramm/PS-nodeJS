-- Scoped additive migration. Execute only after explicit approval.
-- Deliberately no cascading business FKs: immutable evidence must outlive its sources.
CREATE TABLE MilestoneConsolidationPreviews (
    PreviewId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    ActorId INT NOT NULL,
    ProjectOurId VARCHAR(80) NOT NULL,
    SourceMilestoneId INT NOT NULL,
    DestinationMilestoneId INT NOT NULL,
    Revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    SnapshotJSON LONGTEXT NOT NULL,
    CreatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT CK_ConsolidationPreview_JSON CHECK (JSON_VALID(SnapshotJSON)),
    INDEX IX_ConsolidationPreview_Project (ProjectOurId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Rollback: disable the endpoint and retain this table as audit evidence.
