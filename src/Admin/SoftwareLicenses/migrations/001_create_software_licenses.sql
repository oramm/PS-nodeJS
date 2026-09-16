-- LIC-1: local first; production apply belongs to LIC-5.
-- No EditorId: v1 follows the Cars timestamp-only edit metadata policy.
CREATE TABLE SoftwareLicenses (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Manufacturer VARCHAR(255) NOT NULL,
    Product VARCHAR(255) NOT NULL,
    Version VARCHAR(100) NULL,
    LicenseType VARCHAR(20) NULL,
    EncryptedLicenseKey MEDIUMTEXT CHARACTER SET ascii COLLATE ascii_bin NULL,
    RegistrationAccount VARCHAR(320) NULL,
    VendorPanelUrl TEXT NULL,
    SeatsPurchased INT NOT NULL,
    SeatsUsed INT NOT NULL,
    Assignment TEXT NULL,
    PurchaseDate DATE NULL,
    ExpirationDate DATE NULL,
    Cost DECIMAL(12,2) NULL COMMENT 'Koszt brutto w PLN',
    BillingCycle VARCHAR(100) NULL,
    Status VARCHAR(100) NULL,
    Comment TEXT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_software_licenses_manufacturer CHECK (CHAR_LENGTH(TRIM(Manufacturer)) > 0),
    CONSTRAINT chk_software_licenses_product CHECK (CHAR_LENGTH(TRIM(Product)) > 0),
    CONSTRAINT chk_software_licenses_type CHECK (LicenseType IS NULL OR BINARY LicenseType IN ('OEM', 'Retail', 'Volume', 'Subscription')),
    CONSTRAINT chk_software_licenses_seats CHECK (SeatsPurchased >= 0 AND SeatsUsed >= 0 AND SeatsUsed <= SeatsPurchased),
    CONSTRAINT chk_software_licenses_cost CHECK (Cost IS NULL OR Cost >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
