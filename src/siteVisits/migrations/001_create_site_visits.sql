-- =====================================================
-- Migracja: Wizyty na budowie (Site Visits)
-- Baza: MariaDB / MySQL
-- Moduł mobilny (PWA): pracownik z uprawnieniem robi zdjęcia na budowie,
-- dyktuje/pisze jeden opis do jednego lub wielu zdjęć, zapisuje log wizyty
-- z GPS i czasem wykonania każdego zdjęcia. Zdjęcia trafiają na Google Drive
-- (do folderu kontraktu), a metadane do poniższych tabel.
--
-- =====================================================

-- -----------------------------------------------------
-- 1) Flaga dostępu w StaffMembers
--    Neutralna nazwa (CanLogSiteVisits) - NIE sugeruje roli "inspektor".
--    Uprawnienie może dostać dowolny pracownik. Wzorzec spójny z pozostałymi
--    flagami StaffMembers (IsDriver, IsInScrum, HasCostInvoiceAccess, HasBankAccess).
--    IF NOT EXISTS - idempotentne (MariaDB), ponowne uruchomienie nie zaszkodzi.
-- -----------------------------------------------------
ALTER TABLE StaffMembers
    ADD COLUMN IF NOT EXISTS CanLogSiteVisits TINYINT(1) NOT NULL DEFAULT 0
    AFTER HasBankAccess;                                -- dostęp do rejestru wizyt na budowie

-- -----------------------------------------------------
-- 2) Wizyty (nagłówek: kontrakt + osoba + jeden opis + folder GD)
--    VisitedAt = czas rozpoczęcia rejestracji (pierwsze zdjęcie / zatwierdzenie).
--    GdFolderId = podfolder utworzony w folderze kontraktu na tę konkretną wizytę.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS SiteVisits (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    ContractId INT NOT NULL,                            -- budowa (Contracts.Id)
    PersonId INT NOT NULL,                              -- autor wizyty (Persons.Id)
    Description TEXT,                                   -- jeden opis do 1..N zdjęć (może być pusty)
    GdFolderId VARCHAR(255),                            -- podfolder wizyty na Google Drive
    VisitedAt DATETIME NOT NULL,                        -- data/godzina wizyty
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_sitevisits_contract
        FOREIGN KEY (ContractId) REFERENCES Contracts(Id) ON DELETE CASCADE,
    CONSTRAINT fk_sitevisits_person
        FOREIGN KEY (PersonId) REFERENCES Persons(Id),
    INDEX idx_sitevisits_contract (ContractId),
    INDEX idx_sitevisits_person (PersonId),
    INDEX idx_sitevisits_visitedat (VisitedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------
-- 3) Zdjęcia wizyty (GPS + czas PER zdjęcie)
--    GPS i czas trzymane per zdjęcie, bo wymóg brzmi "gdzie i kiedy zrobiono
--    zdjęcie" - pozycja pobierana z navigator.geolocation w chwili wykonania
--    kadru (EXIF jest usuwany przez mobilne przeglądarki). Współrzędne mogą być
--    NULL, gdy urządzenie odmówi dostępu do lokalizacji.
--    GdFileId = plik zdjęcia na Google Drive (wersja z ewentualnym rysunkiem inspektora).
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS SiteVisitPhotos (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    SiteVisitId INT NOT NULL,                           -- wizyta nadrzędna
    GdFileId VARCHAR(255) NOT NULL,                     -- plik na Google Drive
    FileName VARCHAR(255),                              -- nazwa pliku (dla podglądu/porządku)
    TakenAt DATETIME,                                   -- czas wykonania zdjęcia
    Latitude DECIMAL(10, 7),                            -- szerokość geograficzna (-90..90)
    Longitude DECIMAL(10, 7),                           -- długość geograficzna (-180..180)
    GpsAccuracy FLOAT,                                  -- dokładność GPS w metrach (jeśli dostępna)
    SortOrder INT NOT NULL DEFAULT 0,                   -- kolejność w siatce
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_sitevisitphotos_visit
        FOREIGN KEY (SiteVisitId) REFERENCES SiteVisits(Id) ON DELETE CASCADE,
    INDEX idx_sitevisitphotos_visit (SiteVisitId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
