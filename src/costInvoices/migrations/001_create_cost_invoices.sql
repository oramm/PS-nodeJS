-- =====================================================
-- Migracja: Faktury Kosztowe (Cost Invoices)
-- Baza: MySQL
-- =====================================================

-- Tabela synchronizacji
CREATE TABLE IF NOT EXISTS CostInvoiceSyncs (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    StartedAt DATETIME NOT NULL,
    CompletedAt DATETIME NULL,
    DateFrom DATE NOT NULL,
    DateTo DATE NOT NULL,
    SyncType VARCHAR(20) NOT NULL DEFAULT 'INCREMENTAL',  -- INCREMENTAL, FULL, VERIFICATION
    ImportedCount INT DEFAULT 0,
    SkippedCount INT DEFAULT 0,
    ErrorCount INT DEFAULT 0,
    Errors JSON NULL,
    UserId INT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'RUNNING',  -- RUNNING, COMPLETED, FAILED, IN_PROGRESS
    INDEX idx_sync_status (Status),
    INDEX idx_sync_completed (CompletedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Kategorie kosztów
CREATE TABLE IF NOT EXISTS CostCategories (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    ParentId INT NULL,
    Color VARCHAR(7) NULL,  -- Kolor HEX np. #FF5733
    VatDeductionDefault DECIMAL(5,2) DEFAULT 100,  -- Domyślny % odliczenia VAT
    IsActive TINYINT(1) DEFAULT 1,
    SortOrder INT DEFAULT 0,
    FOREIGN KEY (ParentId) REFERENCES CostCategories(Id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Predefiniowane kategorie
INSERT INTO CostCategories (Name, Color, VatDeductionDefault, SortOrder) VALUES
('Materiały biurowe', '#3498DB', 100, 1),
('Usługi IT', '#9B59B6', 100, 2),
('Telekomunikacja', '#1ABC9C', 100, 3),
('Media (prąd, gaz, woda)', '#E74C3C', 100, 4),
('Wynajem i dzierżawa', '#F39C12', 100, 5),
('Paliwo i transport', '#2ECC71', 50, 6),  -- 50% odliczenia VAT dla samochodów osobowych
('Reprezentacja', '#E67E22', 0, 7),  -- 0% odliczenia VAT dla reprezentacji
('Usługi prawne i doradcze', '#34495E', 100, 8),
('Szkolenia i konferencje', '#16A085', 100, 9),
('Inne', '#95A5A6', 100, 10);

-- Główna tabela faktur kosztowych
CREATE TABLE IF NOT EXISTS CostInvoices (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Identyfikacja KSeF
    KsefNumber VARCHAR(50) NOT NULL UNIQUE,
    KsefAcquisitionDate DATETIME NULL,
    
    -- Synchronizacja
    SyncId INT NULL,
    
    -- Dane dostawcy
    SupplierNip VARCHAR(15) NULL,
    SupplierName VARCHAR(255) NOT NULL,
    SupplierAddress VARCHAR(500) NULL,
    
    -- Dane faktury
    InvoiceNumber VARCHAR(100) NOT NULL,
    IssueDate DATE NOT NULL,
    SaleDate DATE NULL,
    DueDate DATE NULL,
    
    -- Kwoty
    NetAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
    VatAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
    GrossAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
    Currency VARCHAR(3) DEFAULT 'PLN',
    
    -- Oryginalny XML (LONGTEXT dla dużych faktur)
    XmlContent LONGTEXT NULL,
    
    -- Status księgowania (uproszczony: NEW -> BOOKED)
    Status VARCHAR(20) NOT NULL DEFAULT 'NEW',  -- NEW, BOOKED
    
    -- Ustawienia księgowania
    BookingPercentage DECIMAL(5,2) DEFAULT 100,  -- % faktury do zaksięgowania
    VatDeductionPercentage DECIMAL(5,2) DEFAULT 100,  -- % VAT do odliczenia
    
    -- Kategoria
    CategoryId INT NULL,
    
    -- Audyt
    BookedBy INT NULL,
    BookedAt DATETIME NULL,
    Notes TEXT NULL,
    
    -- Timestamps
    CreatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- Indeksy
    INDEX idx_ksef_number (KsefNumber),
    INDEX idx_status (Status),
    INDEX idx_issue_date (IssueDate),
    INDEX idx_supplier_nip (SupplierNip),
    INDEX idx_category (CategoryId),
    
    -- Klucze obce
    FOREIGN KEY (SyncId) REFERENCES CostInvoiceSyncs(Id) ON DELETE SET NULL,
    FOREIGN KEY (CategoryId) REFERENCES CostCategories(Id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pozycje faktur kosztowych
CREATE TABLE IF NOT EXISTS CostInvoiceItems (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    CostInvoiceId INT NOT NULL,
    
    -- Pozycja
    LineNumber INT NOT NULL DEFAULT 1,
    Description VARCHAR(500) NOT NULL,
    
    -- Ilość i cena
    Quantity DECIMAL(15,4) DEFAULT 1,
    Unit VARCHAR(20) DEFAULT 'szt.',
    UnitPrice DECIMAL(15,4) DEFAULT 0,
    
    -- Wartości
    NetValue DECIMAL(15,2) NOT NULL DEFAULT 0,
    VatRate DECIMAL(5,2) DEFAULT 23,
    VatValue DECIMAL(15,2) NOT NULL DEFAULT 0,
    GrossValue DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    -- Księgowanie per pozycja
    IsSelectedForBooking TINYINT(1) DEFAULT 1,  -- Czy pozycja jest wybrana do księgowania
    BookingPercentage DECIMAL(5,2) DEFAULT 100,  -- % pozycji do zaksięgowania
    VatDeductionPercentage DECIMAL(5,2) DEFAULT 100,  -- % VAT do odliczenia
    
    -- Kategoria per pozycja (opcjonalne - nadpisuje fakturę)
    CategoryId INT NULL,
    
    INDEX idx_invoice (CostInvoiceId),
    
    FOREIGN KEY (CostInvoiceId) REFERENCES CostInvoices(Id) ON DELETE CASCADE,
    FOREIGN KEY (CategoryId) REFERENCES CostCategories(Id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
