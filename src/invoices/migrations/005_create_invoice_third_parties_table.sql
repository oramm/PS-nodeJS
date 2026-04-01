-- Migration: Add InvoiceThirdParties table for multiple Podmiot3 entries
-- Date: 2026-04-01

CREATE TABLE IF NOT EXISTS InvoiceThirdParties (
    Id INT NOT NULL AUTO_INCREMENT,
    InvoiceId INT NOT NULL,
    EntityId INT NOT NULL,
    Role TINYINT UNSIGNED NOT NULL,
    Position INT NOT NULL DEFAULT 1,
    PRIMARY KEY (Id),
    KEY idx_invoice_third_parties_invoice_id (InvoiceId),
    KEY idx_invoice_third_parties_entity_id (EntityId),
    CONSTRAINT fk_invoice_third_parties_invoice
        FOREIGN KEY (InvoiceId) REFERENCES Invoices (Id)
        ON DELETE CASCADE,
    CONSTRAINT fk_invoice_third_parties_entity
        FOREIGN KEY (EntityId) REFERENCES Entities (Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO InvoiceThirdParties (InvoiceId, EntityId, Role, Position)
SELECT
    i.Id,
    i.ThirdPartyEntityId,
    CASE
        WHEN i.IsJstSubordinate = 1 THEN 8
        WHEN i.IsGvMember = 1 THEN 10
        ELSE 10
    END AS Role,
    1 AS Position
FROM Invoices i
WHERE i.IncludeThirdParty = 1
  AND i.ThirdPartyEntityId IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM InvoiceThirdParties itp
      WHERE itp.InvoiceId = i.Id
  );
