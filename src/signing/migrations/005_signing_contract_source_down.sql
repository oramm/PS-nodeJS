-- Rollback dla 005_signing_contract_source.sql
--
-- UWAGA: kasuje zlecenia podpisu dokumentow umow i wpisy rejestru podpisow tych dokumentow (pliki
-- na Dysku zostaja). Kopia przed uruchomieniem:
--   SELECT * FROM SigningJobs WHERE ContractId IS NOT NULL;
--   SELECT * FROM DocumentSignatures WHERE ContractId IS NOT NULL OR SourceType = 'CONTRACT_DOCUMENT';
-- Najpierw cofnij kod serwera: nowy kod nie dziala bez tych kolumn.
-- Jednorazowy: drugie uruchomienie konczy sie bledem na pierwszym DELETE (kolumny ContractId juz nie ma).

DELETE FROM DocumentSignatures WHERE ContractId IS NOT NULL OR SourceType = 'CONTRACT_DOCUMENT';
DELETE FROM SigningJobs WHERE ContractId IS NOT NULL;

ALTER TABLE DocumentSignatures
    DROP FOREIGN KEY IF EXISTS fk_document_signatures_contract;
ALTER TABLE DocumentSignatures
    DROP KEY IF EXISTS idx_document_signatures_contract,
    DROP COLUMN IF EXISTS ContractId;

ALTER TABLE SigningJobs
    DROP CONSTRAINT IF EXISTS chk_signing_jobs_one_source,
    DROP FOREIGN KEY IF EXISTS fk_signing_jobs_contract;
ALTER TABLE SigningJobs
    DROP KEY IF EXISTS idx_signing_jobs_contract,
    DROP COLUMN IF EXISTS ContractId;
ALTER TABLE SigningJobs
    ADD CONSTRAINT chk_signing_jobs_one_source CHECK ((LetterId IS NULL) <> (OfferId IS NULL));
