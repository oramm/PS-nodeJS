-- =====================================================
-- Migracja: StaffMembers - uprawnienia/role funkcyjne personelu
-- Baza: MariaDB / MySQL
-- Zastępuje rozproszone wyjątki zależne od roli (np. zaszyta osoba 386 w scrumie)
-- jedną tabelą z flagami, edytowalną per osoba.
-- =====================================================

CREATE TABLE IF NOT EXISTS StaffMembers (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    PersonId INT NOT NULL UNIQUE,
    IsDriver TINYINT(1) NOT NULL DEFAULT 0,             -- kierowca (kilometrówka)
    IsInScrum TINYINT(1) NOT NULL DEFAULT 0,            -- uwzględniany w scrumie
    HasCostInvoiceAccess TINYINT(1) NOT NULL DEFAULT 0, -- dostęp do faktur kosztowych
    HasBankAccess TINYINT(1) NOT NULL DEFAULT 0,        -- dostęp do wyciągów bankowych
    IsActive TINYINT(1) NOT NULL DEFAULT 1,             -- odejście z firmy → 0 (bez usuwania historii)
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (PersonId) REFERENCES Persons(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed początkowy: osoby z rolami 1/2/3 (rola liczona z COALESCE konta V2 → Persons,
-- żeby nie pominąć osób z rolą tylko w PersonAccounts).
-- Reguła: wszyscy = kierowcy; rola 3 = w scrumie; role 1,2 = faktury kosztowe + bank.
-- INSERT IGNORE: idempotentne - ponowne uruchomienie NIE nadpisuje ręcznie
-- wprowadzonych/zmienionych wierszy (pomija istniejące PersonId), dodaje tylko brakujące.
-- IsInScrum: rola 3 ORAZ osoba 386 (dawny wyjątek: manager zaszyty w scrumie w
-- Setup.ScrumBoard.timesSummaryExtraPersonId). Wcielone do seeda (a nie osobny UPDATE),
-- żeby ponowne uruchomienie NIE nadpisywało ręcznej zmiany flagi 386.
INSERT IGNORE INTO StaffMembers (PersonId, IsDriver, IsInScrum, HasCostInvoiceAccess, HasBankAccess)
SELECT sub.Id,
       1,
       CASE WHEN sub.Id = 386 OR sub.role = 3 THEN 1 ELSE 0 END,
       IF(sub.role IN (1, 2), 1, 0),
       IF(sub.role IN (1, 2), 1, 0)
FROM (
    SELECT p.Id AS Id, COALESCE(pa.SystemRoleId, p.SystemRoleId) AS role
    FROM Persons p
    LEFT JOIN PersonAccounts pa ON pa.PersonId = p.Id
) sub
WHERE sub.role IN (1, 2, 3);
