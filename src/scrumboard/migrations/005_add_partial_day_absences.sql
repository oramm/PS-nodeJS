-- 005_add_partial_day_absences.sql
-- Nieobecność na część dnia ("urlop na godziny"), pack GOD.
--   1. Typy nieobecności zyskują flagę AllowsPartialDay ("ten typ wolno brać na godziny").
--      Domyślnie TRUE dla wszystkich, L4 dostaje FALSE. Decyzja ownera: o wyjątkach decyduje
--      flaga w panelu administracyjnym, nie kod - system nie egzekwuje różnic prawnych.
--   2. Nieobecność zyskuje StartTime/EndTime. Oba NULL = cały dzień, więc wszystkie istniejące
--      wiersze zostają poprawne bez konwersji.
--   3. WorkingDaysCount z INT na DECIMAL(5,2), żeby zmieścić ułamek dnia. Kolumna NIE jest
--      źródłem sald (te liczą się w locie z dat) i zasila wyłącznie dymek nad paskiem rocznym,
--      więc zmiana typu nie przelicza historii.
-- Reguła spójności "albo oba czasy puste, albo oba wypełnione i wtedy DateFrom = DateTo" jest
-- świadomie pilnowana walidacją w aplikacji, nie więzem w bazie.
-- Idempotentna: ADD COLUMN IF NOT EXISTS, a MODIFY COLUMN jest z natury powtarzalne.

ALTER TABLE ScrumboardAbsenceTypes
    ADD COLUMN IF NOT EXISTS AllowsPartialDay BOOLEAN NOT NULL DEFAULT TRUE
        COMMENT 'czy ten typ wolno wpisać na część dnia' AFTER CountsAsHoliday;

ALTER TABLE ScrumboardAbsences
    ADD COLUMN IF NOT EXISTS StartTime TIME NULL
        COMMENT 'godzina od; NULL razem z EndTime = cały dzień' AFTER DateTo;

ALTER TABLE ScrumboardAbsences
    ADD COLUMN IF NOT EXISTS EndTime TIME NULL
        COMMENT 'godzina do; NULL razem z StartTime = cały dzień' AFTER StartTime;

ALTER TABLE ScrumboardAbsences
    MODIFY COLUMN WorkingDaysCount DECIMAL(5,2) NOT NULL DEFAULT 0
        COMMENT 'dni pon-pt w zakresie; ułamek dla części dnia (8 h = 1 dzień)';

-- Wartość startowa flagi dla L4.
-- UWAGA: to jest wpis bezwarunkowy - ponowne uruchomienie migracji ustawi L4 z powrotem na
-- FALSE. Jeżeli owner kiedyś włączy część dnia dla L4 w panelu, nie puszczaj 005 drugi raz
-- bez sprawdzenia tej wartości.
UPDATE ScrumboardAbsenceTypes SET AllowsPartialDay = FALSE WHERE Name = 'L4';
