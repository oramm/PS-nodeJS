-- 003_add_care_pool_and_absence_types_down.sql
-- Wycofanie 003. Typy Opieka/L4 usuwane tylko gdy nieużywane (brak nieobecności),
-- żeby nie skasować danych wprowadzonych z UI (FK i tak by to zablokował — guard dla czytelności).

DELETE FROM ScrumboardAbsenceTypes
WHERE Name IN ('Opieka', 'L4')
  AND NOT EXISTS (
      SELECT 1 FROM ScrumboardAbsences a WHERE a.TypeId = ScrumboardAbsenceTypes.Id
  );

ALTER TABLE ScrumboardVacationEntitlements DROP COLUMN IF EXISTS CareDays;
ALTER TABLE ScrumboardAbsenceTypes DROP COLUMN IF EXISTS CountsAsCare;
