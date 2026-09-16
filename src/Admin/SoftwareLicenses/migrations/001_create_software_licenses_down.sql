-- Destructive: removes all license records. Back up before rollback once populated.
-- After successful DROP, remove only this migration's SchemaMigrations receipt.
DROP TABLE SoftwareLicenses;
