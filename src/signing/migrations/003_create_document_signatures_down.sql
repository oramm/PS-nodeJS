-- Rollback dla 003_create_document_signatures.sql
--
-- UWAGA: kasuje rejestr podpisow (pliki na Dysku zostaja). Kopia przed uruchomieniem:
--   SELECT * FROM DocumentSignatures;

DROP TABLE IF EXISTS DocumentSignatures;
