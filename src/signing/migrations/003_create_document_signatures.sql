-- Migracja: rejestr zlozonych podpisow dokumentow (SIG-2)
-- Data: 2026-10-09
--
-- Kontekst: jeden wiersz = jeden podpisany plik na Dysku Google. Rejestr jest ogolny wzgledem
-- zrodla: dzis pismo i zalacznik pisma, pozniej dokument kontraktu (SIG-6). Dlatego zrodlo opisuje
-- typ (SourceType) i identyfikator pliku na Dysku, a LetterId jest tylko wygodnym kluczem do
-- plakietki "podpisane" na liscie pism (NULL dla zrodel spoza pism).
--
-- Method: LOCAL_APP = podpis zlozony karta przez program ENVI Podpis, MANUAL_UPLOAD = PDF podpisany
--   gdzie indziej i wgrany recznie ("Wgraj podpisany"). Przy MANUAL_UPLOAD zrodlem jest Dokument pisma.
-- SignedAt: moment zapisu podpisanego pliku w PS (UTC), nie data z grafiki.
-- Certyfikat: CN podmiotu, numer seryjny i CN wystawcy - tyle, ile potrzeba do plakietki i audytu.
-- Numeru PESEL ani innych atrybutow podmiotu celowo nie zapisujemy.

CREATE TABLE IF NOT EXISTS DocumentSignatures (
    Id INT(11) NOT NULL AUTO_INCREMENT,
    SourceType ENUM('LETTER','LETTER_ATTACHMENT','CONTRACT_DOCUMENT') NOT NULL,
    SourceGdFileId VARCHAR(100) NULL COMMENT 'Plik zrodlowy na Dysku Google (NULL, gdy nieznany).',
    SignedGdFileId VARCHAR(100) NOT NULL COMMENT 'Podpisany PDF na Dysku Google.',
    SignedName VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    LetterId INT(11) NULL COMMENT 'Pismo, do ktorego nalezy plik (plakietka na liscie pism). NULL dla zrodel spoza pism.',
    Method ENUM('LOCAL_APP','MANUAL_UPLOAD') NOT NULL,
    CertSubjectCn VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    CertSerial VARCHAR(64) NOT NULL,
    CertIssuer VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    SignerPersonId INT(11) NULL COMMENT 'Osoba PS, ktora podpisala (zlozyla zlecenie albo wgrala plik).',
    JobId INT(11) NULL COMMENT 'Zlecenie podpisu (tylko LOCAL_APP).',
    SignedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (Id),
    UNIQUE KEY uq_document_signatures_signed_file (SignedGdFileId),
    KEY idx_document_signatures_letter (LetterId),
    KEY idx_document_signatures_source (SourceGdFileId),
    KEY idx_document_signatures_signer (SignerPersonId),
    KEY idx_document_signatures_job (JobId),
    CONSTRAINT fk_document_signatures_letter FOREIGN KEY (LetterId) REFERENCES Letters (Id) ON DELETE SET NULL,
    CONSTRAINT fk_document_signatures_signer FOREIGN KEY (SignerPersonId) REFERENCES Persons (Id) ON DELETE SET NULL,
    CONSTRAINT fk_document_signatures_job FOREIGN KEY (JobId) REFERENCES SigningJobs (Id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_polish_ci;
