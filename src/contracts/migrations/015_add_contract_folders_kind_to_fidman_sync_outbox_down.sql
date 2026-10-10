-- Najpierw wycofać kod tworzący contract.folders i zarchiwizować/usunąć jego wpisy.
-- Nie wykonywać, gdy istnieją takie wpisy: usunięcie wartości ENUM może uszkodzić Kind.
ALTER TABLE FidmanSyncOutbox
    MODIFY COLUMN Kind ENUM(
        'contract.upsert',
        'entity.upsert',
        'project.upsert',
        'user.upsert',
        'contract.personnel'
    ) NOT NULL
    COMMENT 'Rodzaj pusha (FIDman ingest `kind`). Dokladajac wartosc tutaj, dolozy ja tez do FidmanKind w FidmanSync.ts.';
