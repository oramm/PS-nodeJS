-- Spis skrzynek poczty @envi.com.pl (plan MBX, checkpoint MBX-1).
-- Dotad kody skrzynek zyly tylko w JSON SbAccess.Levels.mail i w liscie zaszytej we froncie.
-- Skrzynka nalezy do projektu ALBO kontraktu albo do nikogo (ogolnofirmowa, np. faktury).
-- Stany: na razie tylko ACTIVE (zalozona); stany zakladania dochodza w MBX-3.
-- Bez kaskad: skasowanie projektu/kontraktu nie moze po cichu zgubic powiazania skrzynki.

CREATE TABLE IF NOT EXISTS MailboxStatuses (
    Code VARCHAR(20) NOT NULL,
    Name VARCHAR(100) NOT NULL,
    PRIMARY KEY (Code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO MailboxStatuses (Code, Name) VALUES
    ('ACTIVE', 'Założona');

CREATE TABLE IF NOT EXISTS Mailboxes (
    Id INT(11) NOT NULL AUTO_INCREMENT,
    Code VARCHAR(40) NOT NULL COMMENT 'Kod skrzynki w SbAccess.Levels.mail i w nazwie serwera sb-poczta-<kod>',
    Address VARCHAR(254) NOT NULL,
    ProjectId INT(11) NULL,
    ContractId INT(11) NULL,
    StatusCode VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (Id),
    UNIQUE KEY uq_mailboxes_code (Code),
    UNIQUE KEY uq_mailboxes_address (Address),
    KEY idx_mailboxes_project (ProjectId),
    KEY idx_mailboxes_contract (ContractId),
    CONSTRAINT fk_mailboxes_project FOREIGN KEY (ProjectId) REFERENCES Projects(Id),
    CONSTRAINT fk_mailboxes_contract FOREIGN KEY (ContractId) REFERENCES Contracts(Id),
    CONSTRAINT fk_mailboxes_status FOREIGN KEY (StatusCode) REFERENCES MailboxStatuses(Code),
    CONSTRAINT chk_mailboxes_one_owner CHECK (ProjectId IS NULL OR ContractId IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Istniejace skrzynki wspolne (D4: imienne marek i wp nie wchodza do spisu).
-- chocianow-ik: kontrakt inzyniera kontraktu Chocianow; w PS jego oznaczenie to CHC.IK.02
-- (workspace SB nazywa go CHC.IK.01 - patrz notatka MBX-1). Brak kontraktu w bazie = NULL, nie blad.
INSERT IGNORE INTO Mailboxes (Code, Address, ContractId) VALUES
    ('faktury', 'faktury@envi.com.pl', NULL),
    ('chocianow-ik', 'chocianow.ik@envi.com.pl',
        (SELECT Id FROM OurContractsData WHERE OurId = 'CHC.IK.02'));
