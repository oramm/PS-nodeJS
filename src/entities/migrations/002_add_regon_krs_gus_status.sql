-- =====================================================
-- Migracja 002: REGON, KRS i wynik porównania z rejestrem GUS przy podmiocie
-- Pack GUS, checkpoint GUS-1 (decyzje D-GUS-1 i D-GUS-2):
--   20_projects/Aplikacje/PS.APP.01/plans/2026-09-09-gus-synchronizacja-podmiotow-plan.md
-- =====================================================
--
-- Wszystko addytywne. Istniejące wiersze zostają poprawne bez żadnej konwersji,
-- a wycofanie to samo DROP COLUMN (002_add_regon_krs_gus_status_down.sql).
--
-- Regon CHAR(14): GUS wydaje REGON 9-znakowy dla siedziby i 14-znakowy dla jednostki
--   lokalnej. Szersza kolumna mieści oba; węższa ucięłaby drugi przypadek.
-- Krs CHAR(10): numer KRS ma zawsze 10 cyfr, z wiodącymi zerami — dlatego tekst,
--   nie liczba (INT zjadłby zera i „0000391193" stałoby się „391193").
--
-- GusStatus jest NOT NULL DEFAULT 'NOT_CHECKED', bo „jeszcze nie sprawdzano" jest
--   odpowiedzią, a nie brakiem odpowiedzi — każdy podmiot ma zdefiniowany stan od
--   pierwszej chwili. Słownik wartości: NOT_CHECKED, OK, DIFF, DIFF_MINOR, NOT_FOUND,
--   CLOSED, ERROR. DIFF_MINOR dopisano w GUS-4a bez migracji — mieści się w VARCHAR(16),
--   a słownika pilnuje kod. Migracja nie weszła jeszcze na produkcję, więc zmienia się
--   tu tylko komentarz; kopia lokalna ma starą treść komentarza kolumny.
--   Pilnuje go kod, nie ENUM: dołożenie stanu ma być zmianą kodu, a nie migracją
--   przebudowującą tabelę. Ten sam wybór co przy WhiteListStatus (costInvoices/004).
--
-- ponytail: migawka w jednej kolumnie JSON zamiast tabeli historii — historia, gdy ktoś jej zażąda
--
-- MariaDB 10.6 (sprawdzone lokalnie: 10.6.25): typ JSON jest tu aliasem LONGTEXT
--   z więzem CHECK (json_valid(...)). Kolumna działa, ale nie wolno na niej używać
--   operatorów JSON specyficznych dla MySQL 8 (->>, JSON_TABLE itp.).
--
-- Idempotentna przez ADD COLUMN IF NOT EXISTS (wzorzec z contracts/011 i contracts/012).

ALTER TABLE Entities
    ADD COLUMN IF NOT EXISTS Regon CHAR(14) NULL
        COMMENT 'REGON z rejestru GUS: 9 znakow dla siedziby, 14 dla jednostki lokalnej'
        AFTER TaxNumber,
    ADD COLUMN IF NOT EXISTS Krs CHAR(10) NULL
        COMMENT 'Numer KRS (rejestr przedsiebiorcow), 10 cyfr z wiodacymi zerami'
        AFTER Regon,
    ADD COLUMN IF NOT EXISTS GusStatus VARCHAR(16) NOT NULL DEFAULT 'NOT_CHECKED'
        COMMENT 'Wynik ostatniego porownania z GUS: NOT_CHECKED, OK, DIFF, DIFF_MINOR, NOT_FOUND, CLOSED, ERROR'
        AFTER Krs,
    ADD COLUMN IF NOT EXISTS GusCheckedAt DATETIME NULL
        COMMENT 'Kiedy ostatnio porownano podmiot z rejestrem GUS'
        AFTER GusStatus,
    ADD COLUMN IF NOT EXISTS GusSnapshot JSON NULL
        COMMENT 'Migawka odpowiedzi GUS: nazwa, adres, REGON, KRS, data zakonczenia dzialalnosci'
        AFTER GusCheckedAt;
