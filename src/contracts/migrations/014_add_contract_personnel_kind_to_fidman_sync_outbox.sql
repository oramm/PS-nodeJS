-- WNM-2: pełna lista personelu kontraktu do FIDmana.
-- MariaDB 10.6: ENUM podaje się w całości; nie istnieje ADD VALUE.
-- Zastosować przed wdrożeniem kodu; w tej sesji migracja nie jest uruchamiana.
ALTER TABLE FidmanSyncOutbox
    MODIFY COLUMN Kind ENUM(
        'contract.upsert',
        'entity.upsert',
        'project.upsert',
        'user.upsert',
        'contract.personnel'
    ) NOT NULL
    COMMENT 'Rodzaj pusha (FIDman ingest `kind`). Dokladajac wartosc tutaj, dolozy ja tez do FidmanKind w FidmanSync.ts.';
