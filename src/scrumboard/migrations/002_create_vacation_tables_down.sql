-- 002_create_vacation_tables_down.sql
-- Wycofanie 002_create_vacation_tables.sql — usuwa cały feature urlopów.
-- UWAGA: kasuje dane urlopowe. Kolejność wg zależności FK:
--   ScrumboardAbsences (FK → typy) → ScrumboardVacationEntitlements → ScrumboardAbsenceTypes.

DROP TABLE IF EXISTS ScrumboardAbsences;
DROP TABLE IF EXISTS ScrumboardVacationEntitlements;
DROP TABLE IF EXISTS ScrumboardAbsenceTypes;
