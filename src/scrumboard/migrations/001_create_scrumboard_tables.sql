-- Migration: Create scrumboard tables
-- Tables: ScrumboardContractStatuses, ScrumboardPlanningEntries
-- Purpose: Web-app replacement for the Google Sheets scrumboard
--          ("aktualny sprint" / "planowanie").
--          Separate tables (not columns on Contracts/Persons) so the whole
--          scrumboard feature can be retired later with simple DROP TABLE.

-- Flaga "Omowiony na planowaniu" per kontrakt
CREATE TABLE IF NOT EXISTS ScrumboardContractStatuses (
    ContractId INT NOT NULL PRIMARY KEY,
    Discussed BOOLEAN NOT NULL DEFAULT FALSE,
    DiscussedAt DATETIME NULL DEFAULT NULL,
    DiscussedByPersonId INT NULL DEFAULT NULL,
    CONSTRAINT fk_scrumcontractstatuses_contract FOREIGN KEY (ContractId)
        REFERENCES Contracts (Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_scrumcontractstatuses_person FOREIGN KEY (DiscussedByPersonId)
        REFERENCES Persons (Id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Odpowiednik arkusza "planowanie": dostepnosc tygodniowa per osoba
-- (liczba godzin w tygodniu jest zawsze wyliczana:
--  WorkingDays*HoursPerDay - (Planning+Retro+Extra) - nie jest przechowywana)
CREATE TABLE IF NOT EXISTS ScrumboardPlanningEntries (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonId INT NOT NULL,
    WorkingDays DECIMAL(3,1) NOT NULL DEFAULT 5 COMMENT 'liczba dni pracy',
    HoursPerDay DECIMAL(4,2) NOT NULL DEFAULT 8 COMMENT 'liczba godzin pracy',
    PlanningMeetingHours DECIMAL(4,2) NOT NULL DEFAULT 2 COMMENT 'planowanie',
    RetroMeetingHours DECIMAL(4,2) NOT NULL DEFAULT 1.5 COMMENT 'spotkanie koncowe',
    ExtraMeetingsHours DECIMAL(4,2) NOT NULL DEFAULT 0 COMMENT 'dodatkowe spotkania',
    LastUpdated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_scrumplanningentries_person (PersonId),
    CONSTRAINT fk_scrumplanningentries_person FOREIGN KEY (PersonId)
        REFERENCES Persons (Id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
