-- Prepared source only. Apply only with separate authorization and real SQL proof.
-- Historical checks must survive source cleanup: no cascading business foreign keys.
CREATE TABLE MilestoneConsolidationChecks (
    CheckId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    OperationId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ActorId INT NOT NULL,
    OperationRevision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Revision CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    SnapshotJSON LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    ResultJSON LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (CheckId),
    KEY ix_consolidation_check_operation (OperationId, ActorId),
    CONSTRAINT ck_consolidation_check_snapshot CHECK (JSON_VALID(SnapshotJSON)),
    CONSTRAINT ck_consolidation_check_result CHECK (JSON_VALID(ResultJSON))
) ENGINE=InnoDB;
