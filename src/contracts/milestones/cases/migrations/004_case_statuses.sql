-- Statusy spraw (Cases.Status):
-- 1. Nowa kolumna Cases.Status — wartości z Setup.CaseStatus: 'Na zaś' | 'W trakcie' | 'Zamknięta'.
--    DEFAULT 'Na zaś' — status nowo tworzonych spraw, gdy insert go nie poda.
-- 2. Backfill istniejących spraw dziedziczy po statusie kamienia milowego:
--    Zakończony / Archiwalny -> 'Zamknięta'
--    Nie rozpoczęty          -> 'Na zaś'
--    W trakcie / NULL / inne -> 'W trakcie'

ALTER TABLE Cases
    ADD Status VARCHAR(30) NOT NULL DEFAULT 'Na zaś';

UPDATE Cases
JOIN Milestones ON Milestones.Id = Cases.MilestoneId
SET Cases.Status = CASE
    WHEN Milestones.Status IN ('Zakończony', 'Archiwalny') THEN 'Zamknięta'
    WHEN Milestones.Status = 'Nie rozpoczęty' THEN 'Na zaś'
    ELSE 'W trakcie'
END;
