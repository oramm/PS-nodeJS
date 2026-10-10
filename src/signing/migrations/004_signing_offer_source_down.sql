-- Rollback dla 004_signing_offer_source.sql
--
-- UWAGA: kasuje zlecenia podpisu ofert i wpisy rejestru podpisow plikow ofert (pliki na Dysku
-- zostaja). Kopia przed uruchomieniem:
--   SELECT * FROM SigningJobs WHERE OfferId IS NOT NULL;
--   SELECT * FROM DocumentSignatures WHERE OfferId IS NOT NULL OR SourceType = 'OFFER_DOCUMENT';
-- Najpierw cofnij kod serwera: stary kod nie zna zlecen bez pisma, nowy nie dziala bez tych kolumn.

DELETE FROM DocumentSignatures WHERE OfferId IS NOT NULL OR SourceType = 'OFFER_DOCUMENT';
DELETE FROM SigningJobs WHERE OfferId IS NOT NULL;

ALTER TABLE DocumentSignatures
    DROP FOREIGN KEY IF EXISTS fk_document_signatures_offer;
ALTER TABLE DocumentSignatures
    DROP KEY IF EXISTS idx_document_signatures_offer,
    DROP COLUMN IF EXISTS OfferId,
    MODIFY SourceType ENUM('LETTER','LETTER_ATTACHMENT','CONTRACT_DOCUMENT') NOT NULL;

ALTER TABLE SigningJobFiles
    DROP CONSTRAINT IF EXISTS chk_signing_job_files_graphic_complete;
ALTER TABLE SigningJobFiles
    DROP COLUMN IF EXISTS GraphicPage,
    DROP COLUMN IF EXISTS GraphicX,
    DROP COLUMN IF EXISTS GraphicY,
    DROP COLUMN IF EXISTS GraphicWidth,
    DROP COLUMN IF EXISTS GraphicHeight;

ALTER TABLE SigningJobs
    DROP CONSTRAINT IF EXISTS chk_signing_jobs_one_source,
    DROP FOREIGN KEY IF EXISTS fk_signing_jobs_offer;
ALTER TABLE SigningJobs
    DROP KEY IF EXISTS idx_signing_jobs_offer,
    DROP COLUMN IF EXISTS OfferId,
    MODIFY LetterId INT(11) NOT NULL COMMENT 'Pismo, ktorego pliki zlecenie obejmuje.';
