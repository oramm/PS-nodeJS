-- Rollback dla 002_create_signing_job_files.sql
--
-- UWAGA: kasuje pliki zlecen podpisu (metadane i ewentualne zamrozone PDF-y). Kopia przed uruchomieniem:
--   SELECT Id, JobId, SourceGdFileId, SignedGdFileId FROM SigningJobFiles;

DROP TABLE IF EXISTS SigningJobFiles;
