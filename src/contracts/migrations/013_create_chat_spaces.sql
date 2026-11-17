-- Migracja: pokoje Google Chat i przypisanie umowy do pokoju (CHT-2)
-- Data: 2026-10-04
--
-- Kontekst: baza ma pamietac, ktora umowa ENVI nalezy do ktorego pokoju Google Chat.
-- Wiele umow moze wskazywac jeden pokoj (relacja N:1), dlatego pokoj jest osobna tabela,
-- a umowa dostaje tylko wskaznik ChatSpaceId.
--
-- ChatSpaces.GoogleName to identyfikator pokoju nadany przez Google (np. spaces/AAQA...).
-- Jest unikalny, zeby ten sam pokoj nie powstal dwa razy.
-- ChatSpaces.ProjectOurId (opcjonalny) wskazuje projekt, z ktorym pokoj jest zwiazany;
-- Projects.OurId jest unikalny, wiec moze byc kluczem obcym. Usuniecie projektu zeruje wskaznik,
-- nie kasuje pokoju.
-- Contracts.ChatSpaceId NULL = umowa nie ma przypisanego pokoju. Usuniecie pokoju zeruje
-- wskaznik u umow (ON DELETE SET NULL), nie kasuje umow.
--
-- MariaDB 10.6: CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS.
-- Engine/charset zgodne z Contracts i Projects (InnoDB, utf8mb3_polish_ci), inaczej FK sie nie zalozy.

CREATE TABLE IF NOT EXISTS ChatSpaces (
    Id INT(11) NOT NULL AUTO_INCREMENT,
    GoogleName VARCHAR(64) NOT NULL COMMENT 'Identyfikator pokoju z Google Chat API, np. spaces/AAQA... Unikalny.',
    DisplayName VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Nazwa pokoju widoczna w Google Chat (utf8mb4: nazwy z Google moga miec emoji).',
    Uri VARCHAR(512) NULL COMMENT 'Link do pokoju. NULL = nie zapisano.',
    ProjectOurId VARCHAR(20) NULL COMMENT 'Projekt zwiazany z pokojem (Projects.OurId). NULL = pokoj bez projektu.',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CreatedByPersonId INT(11) NULL COMMENT 'Kto zalozyl wpis o pokoju w PS.',
    PRIMARY KEY (Id),
    UNIQUE KEY uq_chat_spaces_google_name (GoogleName),
    KEY idx_chat_spaces_project_our_id (ProjectOurId),
    KEY idx_chat_spaces_created_by (CreatedByPersonId),
    CONSTRAINT fk_chat_spaces_project FOREIGN KEY (ProjectOurId) REFERENCES Projects (OurId) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_chat_spaces_created_by FOREIGN KEY (CreatedByPersonId) REFERENCES Persons (Id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_polish_ci;

ALTER TABLE Contracts
    ADD COLUMN IF NOT EXISTS ChatSpaceId INT(11) NULL DEFAULT NULL COMMENT 'Pokoj Google Chat tej umowy (ChatSpaces.Id). NULL = umowa bez przypisanego pokoju. Wiele umow moze wskazywac ten sam pokoj.',
    ADD KEY idx_contracts_chat_space_id (ChatSpaceId),
    ADD CONSTRAINT fk_contracts_chat_space FOREIGN KEY (ChatSpaceId) REFERENCES ChatSpaces (Id) ON DELETE SET NULL;
