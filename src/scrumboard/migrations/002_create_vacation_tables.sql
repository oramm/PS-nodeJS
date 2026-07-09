-- Migration: Create scrumboard vacation tables
-- Tables: ScrumboardAbsenceTypes, ScrumboardAbsences, ScrumboardVacationEntitlements
-- Purpose: Web-app replacement for the deprecated Google Sheets "urlopy" tab.
--          Urlop przechowywany jako ZAKRES (od-do), nie komórka-per-dzień.
--          Dni robocze liczone pon-pt (świąt NIE uwzględniamy - decyzja biznesowa).
--          Osobne tabele Scrumboard* => cały feature da się wycofać przez DROP TABLE.

-- Słownik typów nieobecności. CountsAgainstLimit => czy schodzi z rocznego limitu urlopu.
CREATE TABLE IF NOT EXISTS ScrumboardAbsenceTypes (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(60) NOT NULL,
    Color VARCHAR(20) NOT NULL DEFAULT '#0d6efd',
    CountsAgainstLimit BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY uq_scrumabsencetypes_name (Name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed startowy: wypoczynkowy i na żądanie liczą się do limitu, bezpłatny nie.
INSERT INTO ScrumboardAbsenceTypes (Name, Color, CountsAgainstLimit)
SELECT * FROM (
    SELECT 'Wypoczynkowy' AS Name, '#0d6efd' AS Color, TRUE AS CountsAgainstLimit
    UNION ALL SELECT 'Na żądanie', '#fd7e14', TRUE
    UNION ALL SELECT 'Bezpłatny', '#6c757d', FALSE
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM ScrumboardAbsenceTypes);

-- Nieobecność jako zakres dat (DATE, nie DATETIME - unikamy przesunięć stref czasowych).
-- WorkingDaysCount = liczba dni pon-pt w zakresie, wyliczana przy zapisie.
CREATE TABLE IF NOT EXISTS ScrumboardAbsences (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonId INT NOT NULL,
    TypeId INT NOT NULL,
    DateFrom DATE NOT NULL,
    DateTo DATE NOT NULL,
    WorkingDaysCount INT NOT NULL DEFAULT 0 COMMENT 'dni pon-pt w zakresie',
    Note VARCHAR(500) NULL DEFAULT NULL,
    CreatedByPersonId INT NULL DEFAULT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_scrumabsences_person (PersonId),
    KEY idx_scrumabsences_range (DateFrom, DateTo),
    CONSTRAINT fk_scrumabsences_person FOREIGN KEY (PersonId)
        REFERENCES Persons (Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_scrumabsences_type FOREIGN KEY (TypeId)
        REFERENCES ScrumboardAbsenceTypes (Id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_scrumabsences_creator FOREIGN KEY (CreatedByPersonId)
        REFERENCES Persons (Id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Roczny wymiar urlopu per osoba (wpisywany ręcznie, bez automatu na nowy rok).
-- Pozostało = LimitDays - suma dni roboczych z nieobecności typów liczących w danym roku.
CREATE TABLE IF NOT EXISTS ScrumboardVacationEntitlements (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonId INT NOT NULL,
    Year SMALLINT NOT NULL,
    LimitDays DECIMAL(4,1) NOT NULL DEFAULT 0 COMMENT 'wymiar urlopu za bieżący rok',
    CarryoverDays DECIMAL(4,1) NOT NULL DEFAULT 0 COMMENT 'urlop zaległy z poprzedniego roku',
    LastUpdated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_scrumvacationentitlements_person_year (PersonId, Year),
    CONSTRAINT fk_scrumvacationentitlements_person FOREIGN KEY (PersonId)
        REFERENCES Persons (Id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
