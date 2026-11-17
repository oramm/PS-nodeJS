CREATE TABLE IF NOT EXISTS MileageYears (
    Year SMALLINT UNSIGNED NOT NULL PRIMARY KEY,
    SpreadsheetId VARCHAR(100) NULL UNIQUE,
    FolderId VARCHAR(100) NOT NULL,
    FileName VARCHAR(255) NOT NULL,
    OperationId CHAR(36) NOT NULL UNIQUE,
    State ENUM('PLANNED','CREATING','READY') NOT NULL,
    SourceYear SMALLINT UNSIGNED NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Deliberately no FK to Cars: deleting a car must retain its historical identity.
CREATE TABLE IF NOT EXISTS MileageYearCars (
    Year SMALLINT UNSIGNED NOT NULL,
    CarId INT NOT NULL,
    SheetGid INT UNSIGNED NOT NULL,
    PlateSnapshot VARCHAR(100) NOT NULL,
    PRIMARY KEY (Year, CarId),
    UNIQUE KEY uq_mileage_year_gid (Year, SheetGid),
    CONSTRAINT fk_mileage_car_year FOREIGN KEY (Year) REFERENCES MileageYears(Year) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
