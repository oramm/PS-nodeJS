-- Persons V2 schema (P1-A: schema only)
-- Date: 2026-02-09
-- Scope: Create new V2 persons tables without backfill/read/write wiring

CREATE TABLE IF NOT EXISTS PersonAccounts (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonId INT NOT NULL,
    SystemRoleId INT NULL,
    SystemEmail VARCHAR(255) NULL,
    GoogleId VARCHAR(255) NULL,
    GoogleRefreshToken TEXT NULL,
    MicrosoftId VARCHAR(255) NULL,
    MicrosoftRefreshToken TEXT NULL,
    IsActive TINYINT(1) NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_personaccounts_personid (PersonId),
    UNIQUE KEY uq_personaccounts_systememail (SystemEmail),
    INDEX idx_personaccounts_systemroleid (SystemRoleId),
    INDEX idx_personaccounts_googleid (GoogleId),
    INDEX idx_personaccounts_microsoftid (MicrosoftId),
    CONSTRAINT fk_personaccounts_person
        FOREIGN KEY (PersonId) REFERENCES Persons(Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_personaccounts_systemrole
        FOREIGN KEY (SystemRoleId) REFERENCES SystemRoles(Id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Optional 1:1 account data for person';

CREATE TABLE IF NOT EXISTS PersonProfiles (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonId INT NOT NULL,
    Headline VARCHAR(255) NULL,
    Summary TEXT NULL,
    IsVisible TINYINT(1) NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_personprofiles_personid (PersonId),
    INDEX idx_personprofiles_isvisible (IsVisible),
    CONSTRAINT fk_personprofiles_person
        FOREIGN KEY (PersonId) REFERENCES Persons(Id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Optional 1:1 profile data for person';

CREATE TABLE IF NOT EXISTS PersonProfileExperiences (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonProfileId INT NOT NULL,
    SourceLegacyAchievementExternalId INT NULL,
    OrganizationName VARCHAR(255) NULL,
    PositionName VARCHAR(255) NULL,
    Description TEXT NULL,
    DateFrom DATE NULL,
    DateTo DATE NULL,
    IsCurrent TINYINT(1) NOT NULL DEFAULT 0,
    SortOrder INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_personprofileexperiences_sourcelegacyid (SourceLegacyAchievementExternalId),
    INDEX idx_personprofileexperiences_profileid (PersonProfileId),
    INDEX idx_personprofileexperiences_daterange (DateFrom, DateTo),
    CONSTRAINT fk_personprofileexperiences_profile
        FOREIGN KEY (PersonProfileId) REFERENCES PersonProfiles(Id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Profile experiences, target for AchievementsExternal backfill';

CREATE TABLE IF NOT EXISTS PersonProfileEducations (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonProfileId INT NOT NULL,
    SchoolName VARCHAR(255) NULL,
    DegreeName VARCHAR(255) NULL,
    FieldOfStudy VARCHAR(255) NULL,
    DateFrom DATE NULL,
    DateTo DATE NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_personprofileeducations_profileid (PersonProfileId),
    CONSTRAINT fk_personprofileeducations_profile
        FOREIGN KEY (PersonProfileId) REFERENCES PersonProfiles(Id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Schema skeleton for profile education records';

CREATE TABLE IF NOT EXISTS SkillsDictionary (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(120) NOT NULL,
    NameNormalized VARCHAR(120) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_skillsdictionary_name (Name),
    UNIQUE KEY uq_skillsdictionary_namenormalized (NameNormalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Schema skeleton for reusable skills';

CREATE TABLE IF NOT EXISTS PersonProfileSkills (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonProfileId INT NOT NULL,
    SkillId INT NOT NULL,
    LevelCode VARCHAR(32) NULL,
    YearsOfExperience DECIMAL(5,2) NULL,
    SortOrder INT NOT NULL DEFAULT 0,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_personprofileskills_profile_skill (PersonProfileId, SkillId),
    INDEX idx_personprofileskills_skillid (SkillId),
    CONSTRAINT fk_personprofileskills_profile
        FOREIGN KEY (PersonProfileId) REFERENCES PersonProfiles(Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_personprofileskills_skill
        FOREIGN KEY (SkillId) REFERENCES SkillsDictionary(Id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Schema skeleton for profile to skills relation';
