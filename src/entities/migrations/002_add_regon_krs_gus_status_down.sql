-- =====================================================
-- Rollback migracji 002: usunięcie REGON-u, KRS-u i wyniku porównania z GUS
-- z tabeli Entities.
-- =====================================================
--
-- Runner (src/scripts/migrate.ts) świadomie pomija pliki *_down.sql — ten plik
-- uruchamia się ręcznie. Po jego wykonaniu trzeba jeszcze usunąć wiersz migracji
-- z rejestru SchemaMigrations, inaczej `migrate:apply` uzna migrację za wykonaną:
--   DELETE FROM SchemaMigrations
--    WHERE MigrationName = 'src/entities/migrations/002_add_regon_krs_gus_status.sql';
--
-- Uwaga: to jest wycofanie ze stratą danych — REGON, KRS i migawki GUS znikają
-- razem z kolumnami. Wycofanie na bazie z danymi robi się po kopii.
--
-- MariaDB 10.6: więz CHECK (json_valid(GusSnapshot)), który baza zakłada sama przy
-- kolumnie typu JSON, znika razem z kolumną — nie trzeba go usuwać osobno.

ALTER TABLE Entities
    DROP COLUMN IF EXISTS GusSnapshot,
    DROP COLUMN IF EXISTS GusCheckedAt,
    DROP COLUMN IF EXISTS GusStatus,
    DROP COLUMN IF EXISTS Krs,
    DROP COLUMN IF EXISTS Regon;
