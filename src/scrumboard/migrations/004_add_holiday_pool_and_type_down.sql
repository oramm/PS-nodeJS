-- 004_add_holiday_pool_and_type_down.sql
-- Wycofanie 004. Typ usuwany tylko gdy nieużywany (brak nieobecności),
-- żeby nie skasować danych wprowadzonych z UI (FK i tak by to zablokował - guard dla czytelności).

DELETE FROM ScrumboardAbsenceTypes
WHERE Name = 'Wolne za święto'
  AND NOT EXISTS (
      SELECT 1 FROM ScrumboardAbsences a WHERE a.TypeId = ScrumboardAbsenceTypes.Id
  );

ALTER TABLE ScrumboardVacationEntitlements DROP COLUMN IF EXISTS HolidayDays;
ALTER TABLE ScrumboardAbsenceTypes DROP COLUMN IF EXISTS CountsAsHoliday;
