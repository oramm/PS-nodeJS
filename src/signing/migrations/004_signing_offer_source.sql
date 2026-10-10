-- Migracja: podpis plikow oferty (SIG-7) - zlecenie i rejestr podpisow wskazuja oferte zamiast pisma
-- Data: 2026-10-10
--
-- Kontekst: do tej pory jedynym zrodlem plikow do podpisu bylo pismo (SigningJobs.LetterId NOT NULL).
-- Dochodzi drugie zrodlo: pliki oferty zewnetrznej z podfolderu "Oferta" w folderze sprawy
-- "Przygotowanie oferty". Zlecenie nalezy do DOKLADNIE jednego zrodla: pisma albo oferty
-- (chk_signing_jobs_one_source). Kolejne zrodlo (dokumenty kontraktu, SIG-6) dojdzie jako kolejna
-- kolumna z kluczem obcym, nie jako kolumna "typ + id" bez klucza.
--
-- SigningJobFiles.Graphic*: jawne miejsce grafiki podpisu wskazane przy zakladaniu zlecenia
--   (strona od 1, prostokat w punktach PDF, poczatek ukladu w lewym dolnym rogu strony). Komplet
--   albo nic. NULL = miejsce wyznacza serwer wedlug regul zrodla (pismo: pod "Z powazaniem",
--   zalacznik pisma: prawy dolny rog) albo plik jest bez grafiki.
-- DocumentSignatures.SourceType 'OFFER_DOCUMENT': plik z folderu "Oferta" (formularz i zalaczniki
--   nie sa rozrozniane - zaden nie jest dokumentem glownym).
-- DocumentSignatures.OfferId: jak LetterId - klucz do listy podpisow oferty; wiersz ma najwyzej
--   jedno z nich. Tego baza nie pilnuje: MariaDB nie pozwala uzyc w CHECK kolumny z kluczem obcym
--   ON DELETE SET NULL, wiec pilnuje kod (jedno miejsce zapisu: SigningJobRepository.insertSignature).
--
-- MariaDB 10.6+: ALTER ... IF NOT EXISTS. Offers.Id to INT(11), InnoDB.

ALTER TABLE SigningJobs
    MODIFY LetterId INT(11) NULL COMMENT 'Pismo, ktorego pliki zlecenie obejmuje (NULL, gdy zrodlem jest oferta).',
    ADD COLUMN IF NOT EXISTS OfferId INT(11) NULL COMMENT 'Oferta, ktorej pliki zlecenie obejmuje (NULL, gdy zrodlem jest pismo).' AFTER LetterId,
    ADD KEY IF NOT EXISTS idx_signing_jobs_offer (OfferId);

ALTER TABLE SigningJobs
    ADD CONSTRAINT fk_signing_jobs_offer FOREIGN KEY IF NOT EXISTS (OfferId) REFERENCES Offers (Id) ON DELETE CASCADE,
    ADD CONSTRAINT IF NOT EXISTS chk_signing_jobs_one_source CHECK ((LetterId IS NULL) <> (OfferId IS NULL));

ALTER TABLE SigningJobFiles
    ADD COLUMN IF NOT EXISTS GraphicPage INT(11) NULL COMMENT 'Strona grafiki podpisu (od 1), gdy miejsce wskazano jawnie.' AFTER WithGraphic,
    ADD COLUMN IF NOT EXISTS GraphicX DECIMAL(8,2) NULL COMMENT 'Lewa krawedz prostokata grafiki, punkty PDF.' AFTER GraphicPage,
    ADD COLUMN IF NOT EXISTS GraphicY DECIMAL(8,2) NULL COMMENT 'Dolna krawedz prostokata grafiki, punkty PDF (od dolu strony).' AFTER GraphicX,
    ADD COLUMN IF NOT EXISTS GraphicWidth DECIMAL(8,2) NULL AFTER GraphicY,
    ADD COLUMN IF NOT EXISTS GraphicHeight DECIMAL(8,2) NULL AFTER GraphicWidth;

ALTER TABLE SigningJobFiles
    ADD CONSTRAINT IF NOT EXISTS chk_signing_job_files_graphic_complete CHECK (
        (GraphicPage IS NULL AND GraphicX IS NULL AND GraphicY IS NULL AND GraphicWidth IS NULL AND GraphicHeight IS NULL)
        OR (GraphicPage IS NOT NULL AND GraphicX IS NOT NULL AND GraphicY IS NOT NULL AND GraphicWidth IS NOT NULL AND GraphicHeight IS NOT NULL)
    );

ALTER TABLE DocumentSignatures
    MODIFY SourceType ENUM('LETTER','LETTER_ATTACHMENT','CONTRACT_DOCUMENT','OFFER_DOCUMENT') NOT NULL,
    ADD COLUMN IF NOT EXISTS OfferId INT(11) NULL COMMENT 'Oferta, do ktorej nalezy plik. NULL dla zrodel spoza ofert.' AFTER LetterId,
    ADD KEY IF NOT EXISTS idx_document_signatures_offer (OfferId);

ALTER TABLE DocumentSignatures
    ADD CONSTRAINT fk_document_signatures_offer FOREIGN KEY IF NOT EXISTS (OfferId) REFERENCES Offers (Id) ON DELETE SET NULL;
