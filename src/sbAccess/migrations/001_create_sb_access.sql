-- Rejestr stanu dostępu do Second Brain i pełna historia operacji.
-- CASCADE: historia i stan idą za osobą, której dotyczą.
-- SET NULL: skasowanie autora nie kasuje cudzej historii (jak PersonAccountEvents).
-- SbAccessEvents jest append-only na poziomie kodu: brak ścieżki UPDATE/DELETE.

CREATE TABLE IF NOT EXISTS SbAccessStatuses (
    Code VARCHAR(20) NOT NULL PRIMARY KEY COMMENT 'Kod stanu dostępu',
    Name VARCHAR(50) NOT NULL COMMENT 'Nazwa stanu dostępu'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO SbAccessStatuses (Code, Name) VALUES
    ('INVITED', 'Zaproszony'), ('ACTIVE', 'Aktywny'),
    ('BLOCKED', 'Zablokowany'), ('REVOKED', 'Odebrany');

CREATE TABLE IF NOT EXISTS SbAccessActions (
    Code VARCHAR(20) NOT NULL PRIMARY KEY COMMENT 'Kod czynności',
    Name VARCHAR(80) NOT NULL COMMENT 'Nazwa czynności'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO SbAccessActions (Code, Name) VALUES
    ('SEED', 'Wpis startowy (dostep nadany recznie)'),
    ('INVITE', 'Zaproszenie'), ('ACTIVATE', 'Aktywacja (zaproszenie przyjete)'),
    ('BLOCK', 'Zablokowanie'), ('UNBLOCK', 'Odblokowanie'), ('REVOKE', 'Odebranie'),
    ('LINK_GITHUB', 'Przypisanie konta GitHub');

CREATE TABLE IF NOT EXISTS SbAccessResults (
    Code VARCHAR(20) NOT NULL PRIMARY KEY COMMENT 'Kod wyniku operacji',
    Name VARCHAR(50) NOT NULL COMMENT 'Nazwa wyniku operacji'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO SbAccessResults (Code, Name) VALUES
    ('OK', 'Sukces'), ('PARTIAL', 'Sukces czesciowy'), ('FAILED', 'Blad');

CREATE TABLE IF NOT EXISTS SbAccess (
    Id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Identyfikator wpisu dostępu',
    PersonId INT(11) NOT NULL COMMENT 'Osoba, której dotyczy dostęp',
    StatusCode VARCHAR(20) NOT NULL COMMENT 'Aktualny stan dostępu',
    GithubLogin VARCHAR(39) NULL COMMENT 'Nazwa konta GitHub; jedno konto przypisane jednej osobie',
    GithubInvitationId BIGINT NULL COMMENT 'Identyfikator zaproszenia GitHub',
    DrivePermissionId VARCHAR(255) NULL COMMENT 'Identyfikator uprawnienia na Dysku SB.ENVI',
    IsGrantedManually TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Dostęp nadany ręcznie; moduł go nie zdejmuje',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Czas utworzenia wpisu',
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Czas ostatniej zmiany',
    UNIQUE KEY uq_sbaccess_person (PersonId),
    UNIQUE KEY uq_sbaccess_github (GithubLogin),
    KEY idx_sbaccess_status (StatusCode),
    CONSTRAINT fk_sbaccess_person FOREIGN KEY (PersonId) REFERENCES Persons(Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_sbaccess_status FOREIGN KEY (StatusCode) REFERENCES SbAccessStatuses(Code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS SbAccessEvents (
    Id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Identyfikator zdarzenia',
    PersonId INT(11) NOT NULL COMMENT 'Osoba, której dotyczy zdarzenie',
    ActionCode VARCHAR(20) NOT NULL COMMENT 'Wykonana czynność',
    RequestedByPersonId INT(11) NULL COMMENT 'Kto zlecił; NULL oznacza system lub wpis startowy',
    ResultCode VARCHAR(20) NOT NULL COMMENT 'Wynik operacji',
    Note TEXT NULL COMMENT 'Wynik lub uwaga, np. błąd API; nigdy tokeny ani sekrety',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Czas zapisu zdarzenia',
    KEY idx_sbaccessevents_person_created (PersonId, CreatedAt),
    KEY idx_sbaccessevents_requestedby (RequestedByPersonId),
    KEY idx_sbaccessevents_action (ActionCode),
    KEY idx_sbaccessevents_result (ResultCode),
    CONSTRAINT fk_sbaccessevents_person FOREIGN KEY (PersonId) REFERENCES Persons(Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_sbaccessevents_requestedby FOREIGN KEY (RequestedByPersonId) REFERENCES Persons(Id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_sbaccessevents_action FOREIGN KEY (ActionCode) REFERENCES SbAccessActions(Code),
    CONSTRAINT fk_sbaccessevents_result FOREIGN KEY (ResultCode) REFERENCES SbAccessResults(Code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
