-- 005_add_partial_day_absences_down.sql
-- Wycofanie 005.
-- UWAGA, UTRATA DANYCH: powrót WorkingDaysCount na INT ZAOKRĄGLA ułamki, a skasowanie
-- StartTime/EndTime kasuje godziny bezpowrotnie. Wycofanie jest bezpieczne tylko dopóki
-- nie ma ani jednej nieobecności godzinowej. Sprawdź przed uruchomieniem - oba muszą dać 0:
--   SELECT COUNT(*) FROM ScrumboardAbsences WHERE StartTime IS NOT NULL OR EndTime IS NOT NULL;
--   SELECT COUNT(*) FROM ScrumboardAbsences WHERE WorkingDaysCount <> ROUND(WorkingDaysCount);
-- Flagi AllowsPartialDay nie da się odtworzyć po skasowaniu kolumny - jeżeli owner zdążył ją
-- gdziekolwiek przestawić, spisz stan przed wycofaniem.

ALTER TABLE ScrumboardAbsences DROP COLUMN IF EXISTS EndTime;
ALTER TABLE ScrumboardAbsences DROP COLUMN IF EXISTS StartTime;

ALTER TABLE ScrumboardAbsences
    MODIFY COLUMN WorkingDaysCount INT NOT NULL DEFAULT 0
        COMMENT 'dni pon-pt w zakresie';

ALTER TABLE ScrumboardAbsenceTypes DROP COLUMN IF EXISTS AllowsPartialDay;
