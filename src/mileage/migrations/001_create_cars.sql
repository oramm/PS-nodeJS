-- =====================================================
-- Migracja: Samochody (Cars) - słownik pojazdów do kilometrówki
-- Baza: MariaDB / MySQL
-- Szkielet tabeli - wiersze uzupełniane ręcznie.
-- =====================================================

CREATE TABLE IF NOT EXISTS Cars (
    Id INT AUTO_INCREMENT PRIMARY KEY,

    -- Identyfikacja pojazdu
    Brand VARCHAR(50) NOT NULL,                 -- marka, np. Ford
    Model VARCHAR(50) NULL,                      -- model, np. Lancer
    LicensePlateNumber VARCHAR(15) NOT NULL UNIQUE, -- nr rejestracyjny, np. OP 8105L

    -- Mapowanie na arkusz kilometrówki (Google Sheets)
    MileageSpreadsheetId VARCHAR(100) NULL,     -- id arkusza Google
    MileageSheetGid BIGINT NULL,                -- gid zakładki auta w arkuszu

    -- Metadane
    IsActive TINYINT(1) NOT NULL DEFAULT 1,     -- 0 = wycofany z użytku (bez usuwania historii)
    Comment VARCHAR(300) NULL,

    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
