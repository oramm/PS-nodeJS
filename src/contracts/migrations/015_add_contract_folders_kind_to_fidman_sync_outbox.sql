-- LMF-1: pełna migawka folderów kontraktu do FIDmana.
-- Odczyt localhost 2026-10-10: cztery pierwsze wartości; personel dodaje poprzednia migracja 014.
-- Zastosować po 014, przed wdrożeniem kodu. W tej sesji tylko plik, bez wykonania.
ALTER TABLE FidmanSyncOutbox
    MODIFY COLUMN Kind ENUM(
        'contract.upsert',
        'entity.upsert',
        'project.upsert',
        'user.upsert',
        'contract.personnel',
        'contract.folders'
    ) NOT NULL
    COMMENT 'Rodzaj pusha (FIDman ingest `kind`). Dokladajac wartosc tutaj, dolozy ja tez do FidmanKind w FidmanSync.ts.';
