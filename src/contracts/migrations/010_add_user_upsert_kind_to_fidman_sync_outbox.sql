-- Migracja: GLO-P1 — nowy rodzaj pusha do FIDmana: `user.upsert`.
-- Data: 2026-08-16
-- Zakres: rozszerzenie ENUM FidmanSyncOutbox.Kind o 'user.upsert'.
--
-- Dlaczego to osobna migracja, której plan GLO nie przewidywał: kolumna Kind jest ENUM-em
-- z trzema wartościami z 003_create_fidman_sync_outbox.sql. Przy pustym sql_mode (takim,
-- jaki ma produkcja) MySQL nie odrzuca wartości spoza listy, tylko **po cichu zapisuje
-- pusty ciąg** - wiersz outboxu powstaje, wygląda na zapisany, a dostawa wywala się na
-- nieznanym rodzaju i ląduje jako FAILED bez zrozumiałego powodu. Zmierzone lokalnie
-- 2026-08-16: wiersz Id=356 z Kind='' zamiast 'user.upsert'.
--
-- Wniosek na przyszłość dla autora kolejnego rodzaju pusha: dołożenie wartości do
-- FidmanKind w src/contracts/fidmanSync/FidmanSync.ts **wymaga** migracji tej kolumny.
-- MariaDB 10.6 → MODIFY COLUMN (ADD VALUE nie istnieje, ENUM podaje się w całości).

ALTER TABLE FidmanSyncOutbox
    MODIFY COLUMN Kind ENUM(
        'contract.upsert',
        'entity.upsert',
        'project.upsert',
        'user.upsert'
    ) NOT NULL
    COMMENT 'Rodzaj pusha (FIDman ingest `kind`). Dokladajac wartosc tutaj, dolozy ja tez do FidmanKind w FidmanSync.ts.';
