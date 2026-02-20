-- Public Profile Submission V1 schema
-- Date: 2026-02-19

CREATE TABLE IF NOT EXISTS PublicProfileSubmissionLinks (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonId INT NOT NULL,
    TokenHash CHAR(64) NOT NULL,
    ExpiresAt DATETIME NOT NULL,
    RevokedAt DATETIME NULL,
    CreatedByPersonId INT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_publicprofilesubmissionlinks_tokenhash (TokenHash),
    INDEX idx_publicprofilesubmissionlinks_personid (PersonId),
    INDEX idx_publicprofilesubmissionlinks_person_active (PersonId, RevokedAt, ExpiresAt),
    INDEX idx_publicprofilesubmissionlinks_expiresat (ExpiresAt),
    CONSTRAINT fk_publicprofilesubmissionlinks_person
        FOREIGN KEY (PersonId) REFERENCES Persons(Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_publicprofilesubmissionlinks_created_by
        FOREIGN KEY (CreatedByPersonId) REFERENCES Persons(Id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PublicProfileSubmissions (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    LinkId INT NOT NULL,
    PersonId INT NOT NULL,
    Email VARCHAR(255) NULL,
    Status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    SubmittedAt DATETIME NULL,
    ClosedAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_publicprofilesubmissions_linkid (LinkId),
    INDEX idx_publicprofilesubmissions_person_status (PersonId, Status),
    CONSTRAINT fk_publicprofilesubmissions_link
        FOREIGN KEY (LinkId) REFERENCES PublicProfileSubmissionLinks(Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_publicprofilesubmissions_person
        FOREIGN KEY (PersonId) REFERENCES Persons(Id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PublicProfileSubmissionItems (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    SubmissionId INT NOT NULL,
    ItemType VARCHAR(32) NOT NULL,
    ItemStatus VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    PayloadJson JSON NULL,
    AcceptedTargetId INT NULL,
    ReviewedByPersonId INT NULL,
    ReviewedAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_publicprofilesubmissionitems_submission (SubmissionId),
    INDEX idx_publicprofilesubmissionitems_submission_status (SubmissionId, ItemStatus),
    INDEX idx_publicprofilesubmissionitems_submission_type_status (SubmissionId, ItemType, ItemStatus),
    CONSTRAINT fk_publicprofilesubmissionitems_submission
        FOREIGN KEY (SubmissionId) REFERENCES PublicProfileSubmissions(Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_publicprofilesubmissionitems_reviewed_by
        FOREIGN KEY (ReviewedByPersonId) REFERENCES Persons(Id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PublicProfileSubmissionVerifyChallenges (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    SubmissionId INT NOT NULL,
    Email VARCHAR(255) NOT NULL,
    CodeHash CHAR(64) NOT NULL,
    ExpiresAt DATETIME NOT NULL,
    AttemptsLeft INT NOT NULL,
    ConsumedAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_publicprofilesubmissionverify_submission_email (SubmissionId, Email),
    INDEX idx_publicprofilesubmissionverify_expiresat (ExpiresAt),
    CONSTRAINT fk_publicprofilesubmissionverify_submission
        FOREIGN KEY (SubmissionId) REFERENCES PublicProfileSubmissions(Id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PublicProfileSubmissionSessions (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    SubmissionId INT NOT NULL,
    Email VARCHAR(255) NOT NULL,
    SessionTokenHash CHAR(64) NOT NULL,
    ExpiresAt DATETIME NOT NULL,
    RevokedAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_publicprofilesubmissionsessions_tokenhash (SessionTokenHash),
    INDEX idx_publicprofilesubmissionsessions_submission (SubmissionId),
    INDEX idx_publicprofilesubmissionsessions_expiresat (ExpiresAt),
    CONSTRAINT fk_publicprofilesubmissionsessions_submission
        FOREIGN KEY (SubmissionId) REFERENCES PublicProfileSubmissions(Id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

