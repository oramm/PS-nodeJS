-- Prepared only. Execution requires a separate owner decision and isolated SQL verification.
-- Historical identities deliberately have no cascading business FKs. Never purge to retry.
CREATE TABLE MilestoneConsolidationPreparations (
    PreparationId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ActorId INT NOT NULL,
    RequestId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    StateJSON LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    LastUpdated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (PreparationId),
    UNIQUE KEY uq_preparation_request (ActorId, RequestId),
    CONSTRAINT ck_preparation_json CHECK (JSON_VALID(StateJSON))
) ENGINE=InnoDB;

CREATE TABLE MilestoneConsolidationTargetClaims (
    SourceObjectId INT NOT NULL,
    PreparationId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (SourceObjectId),
    KEY ix_preparation_claims (PreparationId),
    CONSTRAINT fk_preparation_claim FOREIGN KEY (PreparationId)
        REFERENCES MilestoneConsolidationPreparations (PreparationId) ON DELETE RESTRICT
) ENGINE=InnoDB;
