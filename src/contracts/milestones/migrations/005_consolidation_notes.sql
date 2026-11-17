-- Additive only. Keep notes after source cleanup; no cascading business FK.
-- Rollback: disable the consuming route, retain notes/evidence; do not DROP automatically.
CREATE TABLE MilestoneConsolidationNotes (
    OperationId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    SourceEntity VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    SourceId INT NOT NULL,
    NoteKind VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    DestinationEntity VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    DestinationId INT NOT NULL,
    SourceContractId INT NOT NULL,
    ActorId INT NOT NULL,
    Body LONGTEXT NULL,
    SnapshotJSON LONGTEXT NOT NULL,
    CreatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (OperationId, SourceEntity, SourceId, NoteKind),
    INDEX IX_ConsolidationNotes_Destination (DestinationEntity, DestinationId),
    CONSTRAINT CK_ConsolidationNotes_JSON CHECK (JSON_VALID(SnapshotJSON)),
    CONSTRAINT CK_ConsolidationNotes_Source CHECK (SourceEntity IN ('Milestones', 'Cases', 'MilestoneDates')),
    CONSTRAINT CK_ConsolidationNotes_Destination CHECK (DestinationEntity IN ('Milestones', 'Cases')),
    CONSTRAINT CK_ConsolidationNotes_Kind CHECK (NoteKind = 'SOURCE_SNAPSHOT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
