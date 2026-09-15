-- Apply before backend and frontend rollout. Additive, no existing records changed.
CREATE TABLE IF NOT EXISTS PrivacyNoticeSnapshots (
    Id INT NOT NULL AUTO_INCREMENT,
    Scope VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Version VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Revision VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Content LONGTEXT NOT NULL,
    ContentHash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    PRIMARY KEY (Id),
    UNIQUE KEY uq_privacy_snapshot (Scope, Version, Revision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS PersonPrivacyAcknowledgements (
    Id INT NOT NULL AUTO_INCREMENT,
    PersonId INT(11) NOT NULL,
    Scope VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Version VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    Revision VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    AcknowledgedAt DATETIME NOT NULL,
    PRIMARY KEY (Id),
    UNIQUE KEY uq_privacy_person_version (PersonId, Scope, Version),
    CONSTRAINT fk_privacy_person FOREIGN KEY (PersonId) REFERENCES Persons(Id) ON DELETE RESTRICT,
    CONSTRAINT fk_privacy_snapshot FOREIGN KEY (Scope, Version, Revision) REFERENCES PrivacyNoticeSnapshots(Scope, Version, Revision) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

