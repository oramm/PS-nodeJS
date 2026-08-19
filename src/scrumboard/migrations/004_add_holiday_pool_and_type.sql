-- 004_add_holiday_pool_and_type.sql
-- Wolne za święto przypadające w sobotę (art. 130 §2 KP: święto w dniu wolnym
-- wynikającym z 5-dniowego tygodnia obniża wymiar czasu pracy o 8 h, więc
-- pracownikowi należy się dodatkowy dzień wolny). W 2026 dotyczy 15 sierpnia.
--   1. Typy nieobecności zyskują flagę CountsAsHoliday (schodzi z osobnej puli "za święta").
--   2. Wymiar urlopu zyskuje kolumnę HolidayDays (roczna pula dni za święta).
--   3. Nowy typ nieobecności: "Wolne za święto".
-- Pula jest wpisywana ręcznie, tak jak opieka - system NIE zna kalendarza świąt
-- (świadoma decyzja z migracji 002, nie zmieniamy jej).
-- Idempotentna: IF NOT EXISTS na kolumnach + WHERE NOT EXISTS na typie.

ALTER TABLE ScrumboardAbsenceTypes
    ADD COLUMN IF NOT EXISTS CountsAsHoliday BOOLEAN NOT NULL DEFAULT FALSE
        COMMENT 'czy schodzi z puli wolnego za święta (HolidayDays)' AFTER CountsAsCare;

ALTER TABLE ScrumboardVacationEntitlements
    ADD COLUMN IF NOT EXISTS HolidayDays DECIMAL(4,1) NOT NULL DEFAULT 0
        COMMENT 'pula dni wolnych za święta wypadające w sobotę, na dany rok' AFTER CareDays;

INSERT INTO ScrumboardAbsenceTypes (Name, Color, CountsAgainstLimit, CountsAsCare, CountsAsHoliday)
SELECT 'Wolne za święto', '#6f42c1', FALSE, FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM ScrumboardAbsenceTypes WHERE Name = 'Wolne za święto');
