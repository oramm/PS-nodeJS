-- Migracja: podpis dokumentow umowy ENVI (SIG-6) - zlecenie i rejestr podpisow wskazuja kontrakt
-- Data: 2026-10-10
--
-- Kontekst: trzecie zrodlo plikow do podpisu obok pisma i oferty: pliki z folderu sprawy
-- "Umowa i zmiany" kontraktu ENVI. Zlecenie nalezy do DOKLADNIE jednego zrodla: pisma, oferty albo
-- kontraktu (chk_signing_jobs_one_source, zastepuje wersje dwuzrodlowa z migracji 004).
--
-- DocumentSignatures.ContractId: jak LetterId i OfferId - klucz do listy podpisow kontraktu; wiersz
--   ma najwyzej jedno z nich. Tego baza nie pilnuje (MariaDB nie pozwala uzyc w CHECK kolumny z
--   kluczem obcym ON DELETE SET NULL), pilnuje kod: SigningJobRepository.insertSignature.
-- DocumentSignatures.SourceType 'CONTRACT_DOCUMENT' istnieje od migracji 003.
--
-- MariaDB 10.6+: ALTER ... IF NOT EXISTS. Contracts.Id to INT(11), InnoDB.

ALTER TABLE SigningJobs
    ADD COLUMN IF NOT EXISTS ContractId INT(11) NULL COMMENT 'Kontrakt ENVI, ktorego dokumenty umowy zlecenie obejmuje (NULL, gdy zrodlem jest pismo albo oferta).' AFTER OfferId,
    ADD KEY IF NOT EXISTS idx_signing_jobs_contract (ContractId);

ALTER TABLE SigningJobs
    DROP CONSTRAINT IF EXISTS chk_signing_jobs_one_source;

ALTER TABLE SigningJobs
    ADD CONSTRAINT fk_signing_jobs_contract FOREIGN KEY IF NOT EXISTS (ContractId) REFERENCES Contracts (Id) ON DELETE CASCADE,
    ADD CONSTRAINT IF NOT EXISTS chk_signing_jobs_one_source CHECK (
        (LetterId IS NOT NULL) + (OfferId IS NOT NULL) + (ContractId IS NOT NULL) = 1
    );

ALTER TABLE DocumentSignatures
    ADD COLUMN IF NOT EXISTS ContractId INT(11) NULL COMMENT 'Kontrakt, do ktorego nalezy plik. NULL dla zrodel spoza kontraktow.' AFTER OfferId,
    ADD KEY IF NOT EXISTS idx_document_signatures_contract (ContractId);

ALTER TABLE DocumentSignatures
    ADD CONSTRAINT fk_document_signatures_contract FOREIGN KEY IF NOT EXISTS (ContractId) REFERENCES Contracts (Id) ON DELETE SET NULL;
