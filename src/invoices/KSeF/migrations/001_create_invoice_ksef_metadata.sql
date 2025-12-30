-- Migracja: Tabela metadanych KSeF dla faktur
-- Data: 2025-12-30
-- Autor: System KSeF Integration

-- Tabela przechowuje metadane wysyłki faktur do KSeF
-- oraz statusy przetwarzania i linki do UPO

CREATE TABLE IF NOT EXISTS InvoiceKsefMetadata (
    InvoiceId INT PRIMARY KEY,
    
    -- Numery referencyjne z KSeF
    ReferenceNumber VARCHAR(64) NULL COMMENT 'Numer referencyjny faktury z wysyłki (do sprawdzenia statusu)',
    SessionReferenceNumber VARCHAR(64) NULL COMMENT 'Numer referencyjny sesji wysyłki',
    KsefNumber VARCHAR(64) NULL COMMENT 'Ostateczny numer KSeF faktury (po przetworzeniu)',
    
    -- Status przetwarzania
    Status VARCHAR(20) NULL COMMENT 'Kod statusu: PENDING, 100, 200, 440, etc.',
    StatusDescription VARCHAR(500) NULL COMMENT 'Opis statusu z KSeF',
    
    -- Daty
    AcquisitionDate DATETIME NULL COMMENT 'Data nadania numeru KSeF',
    PermanentStorageDate DATETIME NULL COMMENT 'Data trwałego zapisu w repozytorium KSeF',
    SubmittedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Data wysłania do KSeF',
    
    -- UPO (Urzędowe Poświadczenie Odbioru)
    UpoDownloadUrl VARCHAR(1000) NULL COMMENT 'Czasowy URL do pobrania UPO',
    UpoDownloadUrlExpirationDate DATETIME NULL COMMENT 'Data wygaśnięcia URL do UPO',
    
    -- Debug/audit
    ResponseRaw JSON NULL COMMENT 'Surowa odpowiedź JSON z KSeF',
    
    -- Indeksy
    INDEX idx_reference_number (ReferenceNumber),
    INDEX idx_ksef_number (KsefNumber),
    INDEX idx_status (Status),
    
    -- Foreign key
    FOREIGN KEY (InvoiceId) REFERENCES Invoices(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Metadane wysyłki faktur do KSeF';

-- Dodaj kolumny KSeF do tabeli Invoices jeśli nie istnieją
-- (sprawdź czy już istnieją przed wykonaniem)

-- ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS KsefNumber VARCHAR(64) NULL;
-- ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS KsefStatus VARCHAR(20) NULL;
-- ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS KsefSessionId VARCHAR(64) NULL;
-- ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS KsefUpo TEXT NULL;
