-- Migration: Create bank synchronization tables

CREATE TABLE IF NOT EXISTS BankStatements (
    Id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    FileName    VARCHAR(255) NOT NULL,
    OurAccountNumber CHAR(26) NOT NULL,
    PeriodFrom  DATE NOT NULL,
    PeriodTo    DATE NOT NULL,
    ClosingBalance DECIMAL(15,2) NULL COMMENT 'Last ending-balance from file',
    ImportedBy  INT NULL,
    ImportedAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    RawChecksum CHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256 of raw file; prevents duplicate imports',
    CONSTRAINT fk_BankStatements_Persons FOREIGN KEY (ImportedBy) REFERENCES Persons(Id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS BankTransfers (
    Id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    BankStatementId INT NOT NULL,
    OrderDate       DATE NULL COMMENT 'May be null for fees',
    ExecDate        DATE NOT NULL,
    OperationType   VARCHAR(50) NOT NULL COMMENT 'Raw type from PKO XML',
    Direction       ENUM('IN','OUT') NOT NULL,
    Amount          DECIMAL(15,2) NOT NULL COMMENT 'Absolute value (always positive)',
    Currency        CHAR(3) NOT NULL DEFAULT 'PLN',
    CounterpartyAccount CHAR(26) NULL,
    CounterpartyName    VARCHAR(255) NULL,
    CounterpartyNip     CHAR(10) NULL,
    Title               TEXT NULL COMMENT 'Parsed from Tytuł or Numer faktury VAT field',
    Description         TEXT NULL COMMENT 'Full description from XML (backup)',
    OperationHash       CHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256(execDate|amount|currency|description)',
    MatchingStatus      ENUM('UNMATCHED','PROPOSED','CONFIRMED','MANUAL') NOT NULL DEFAULT 'UNMATCHED',
    MatchingScore       TINYINT NULL,
    MatchingCandidates  JSON NULL COMMENT 'Top-N proposals with scoring',
    CONSTRAINT fk_BankTransfers_Statement FOREIGN KEY (BankStatementId) REFERENCES BankStatements(Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS PaymentAllocations (
    Id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    BankTransferId  INT NOT NULL,
    InvoiceId       INT NULL,
    CostInvoiceId   INT NULL,
    AllocatedAmount DECIMAL(15,2) NOT NULL,
    AllocatedPercentage DECIMAL(5,2) NOT NULL,
    Source          ENUM('AUTO','MANUAL') NOT NULL,
    Confidence      TINYINT NULL,
    CreatedBy       INT NULL,
    CreatedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_PaymentAllocations_Transfer FOREIGN KEY (BankTransferId) REFERENCES BankTransfers(Id) ON DELETE CASCADE,
    CONSTRAINT fk_PaymentAllocations_Invoice FOREIGN KEY (InvoiceId) REFERENCES Invoices(Id) ON DELETE SET NULL,
    CONSTRAINT fk_PaymentAllocations_CostInvoice FOREIGN KEY (CostInvoiceId) REFERENCES CostInvoices(Id) ON DELETE SET NULL,
    CONSTRAINT fk_PaymentAllocations_Persons FOREIGN KEY (CreatedBy) REFERENCES Persons(Id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
