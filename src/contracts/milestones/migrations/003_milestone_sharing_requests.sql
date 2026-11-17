-- Apply after milestone 002, before PS-MC-2 writers. Retain these tables on rollback.
ALTER TABLE MilestoneContractLinks
    ADD COLUMN IF NOT EXISTS ShortcutStatus VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS ShortcutId VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS OperationId CHAR(36) NULL;
CREATE TABLE IF NOT EXISTS MilestoneSharingState (
    MilestoneId INT NOT NULL PRIMARY KEY,
    Revision CHAR(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- No cascading parent FKs: retries/audit outlive detached links and deleted parents.
CREATE TABLE IF NOT EXISTS MilestoneSharingRequests (
    ActorId INT NOT NULL,
    Endpoint VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    RequestId CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Payload LONGTEXT NOT NULL,
    Result LONGTEXT NOT NULL,
    CreatedAt TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (ActorId, Endpoint, RequestId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
