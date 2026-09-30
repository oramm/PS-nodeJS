-- Flaga zarządzania dostępem do Second Brain; domyślnie nikomu nie nadaje uprawnień.
-- IF NOT EXISTS zapewnia idempotencję w MariaDB 10.6.
ALTER TABLE StaffMembers
    ADD COLUMN IF NOT EXISTS CanManageSbAccess TINYINT(1) NOT NULL DEFAULT 0
    AFTER CanLogSiteVisits; -- zarządza dostępem do SB
