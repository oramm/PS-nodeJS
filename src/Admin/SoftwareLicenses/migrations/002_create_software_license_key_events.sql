-- LIC-3 / D-LIC-5: durable audit, independent of later license/person deletion.
-- No cascading FK: deleting a license must not erase the incident trail.
-- Only server-side identifiers and database UTC time; never key material or request DTOs.
CREATE TABLE SoftwareLicenseKeyEvents (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    SoftwareLicenseId INT NOT NULL,
    ActorPersonId INT NOT NULL,
    RevealedAt DATETIME(6) NOT NULL,
    INDEX idx_license_key_events_license_time (SoftwareLicenseId, RevealedAt),
    CONSTRAINT chk_license_key_events_license CHECK (SoftwareLicenseId > 0),
    CONSTRAINT chk_license_key_events_actor CHECK (ActorPersonId > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
