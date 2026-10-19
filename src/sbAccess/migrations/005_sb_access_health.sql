-- Raport zdrowia instalacji SB na komputerze pracownika (plan SBD, checkpoint SBD-4a).
-- Trzymamy tylko OSTATNI raport (bez historii raportow): biala lista pol w kodzie
-- (sbHealthPolicy.ts) - wersje, stan narzedzi, krotkie opisy bledow i linie logu; bez hasel i tresci poczty.
-- HealthRefreshRequestedAt = admin poprosil o swiezy raport; kolejny raport instalatora czysci znacznik.

ALTER TABLE SbAccess
    ADD COLUMN IF NOT EXISTS HealthReport JSON NULL COMMENT 'Ostatni raport instalatora SB po bialej liscie (wersje, narzedzia, bledy, zdarzenia); NULL = brak raportu',
    ADD COLUMN IF NOT EXISTS HealthReportedAt DATETIME NULL COMMENT 'Czas serwera, w ktorym przyjeto ostatni raport',
    ADD COLUMN IF NOT EXISTS HealthRefreshRequestedAt DATETIME NULL COMMENT 'Kiedy admin poprosil o swiezy raport; NULL = brak prosby';

INSERT IGNORE INTO SbAccessActions (Code, Name) VALUES
    ('REQUEST_HEALTH', 'Prosba o swiezy raport komputera');
