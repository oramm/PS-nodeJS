-- 003_add_care_pool_and_absence_types.sql
-- Rozszerza feature urlopów (002 jest już wdrożone):
--   1. Typy nieobecności zyskują flagę CountsAsCare (schodzi z osobnej puli "opieki").
--   2. Wymiar urlopu zyskuje kolumnę CareDays (roczna pula dni opieki).
--   3. Nowe typy nieobecności: "Opieka" (schodzi z puli opieki) oraz "L4" (nic nie zmniejsza).
-- Idempotentna: IF NOT EXISTS na kolumnach + WHERE NOT EXISTS na typach.

ALTER TABLE ScrumboardAbsenceTypes
    ADD COLUMN IF NOT EXISTS CountsAsCare BOOLEAN NOT NULL DEFAULT FALSE
        COMMENT 'czy schodzi z puli opieki (CareDays)' AFTER CountsAgainstLimit;

ALTER TABLE ScrumboardVacationEntitlements
    ADD COLUMN IF NOT EXISTS CareDays DECIMAL(4,1) NOT NULL DEFAULT 0
        COMMENT 'pula dni opieki na dany rok' AFTER CarryoverDays;

INSERT INTO ScrumboardAbsenceTypes (Name, Color, CountsAgainstLimit, CountsAsCare)
SELECT 'Opieka', '#20c997', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM ScrumboardAbsenceTypes WHERE Name = 'Opieka');

INSERT INTO ScrumboardAbsenceTypes (Name, Color, CountsAgainstLimit, CountsAsCare)
SELECT 'L4', '#dc3545', FALSE, FALSE
WHERE NOT EXISTS (SELECT 1 FROM ScrumboardAbsenceTypes WHERE Name = 'L4');
