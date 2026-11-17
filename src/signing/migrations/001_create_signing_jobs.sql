-- Migracja: zlecenia podpisu pism (SIG-2) i pierwszy certyfikat podpisujacego
-- Data: 2026-10-09
--
-- Kontekst: PS (Heroku) przygotowuje PDF, a podpis sklada kwalifikowana karta na komputerze
-- uzytkownika przez maly program "ENVI Podpis". Zlecenie (SigningJobs) to jednorazowy, krotko
-- wazny wpis, ktory laczy te dwa swiaty. Wiersze zostaja po zakonczeniu jako slad audytowy
-- (kto, kiedy, jakim certyfikatem, z jakim wynikiem).
--
-- TokenHash: SHA-256 (hex) tokenu z linku envi-podpis://job/<token>. Surowego tokenu nie ma w bazie.
-- Status: created -> preparing -> prepared -> finalizing -> done
--         oraz boczne wyjscia: cancelled, expired, failed. preparing i finalizing to krotkie stany
--         "zajete" (jedno zadanie naraz); dzieki nim token jest jednorazowy takze przy rownoleglych
--         zadaniach.
-- CertChainJson: lancuch certyfikatow zlozony przez program, tablica JSON base64 DER (lisc pierwszy);
--         potrzebny do zlozenia podpisu. NULL po zakonczeniu zlecenia.
-- CertChangedWarning = 1: certyfikat jest inny niz pierwszy zapamietany dla tej osoby
--         (PersonSigningCertificates). To ostrzezenie, nie blokada - ludzie odnawiaja karty.
--
-- MariaDB 10.6: CREATE TABLE IF NOT EXISTS. Engine/charset zgodne z Letters i Persons
-- (InnoDB, utf8mb3_polish_ci), inaczej FK sie nie zalozy. Teksty od uzytkownika/Google
-- (powod anulowania, blad, nazwy) sa utf8mb4, bo moga zawierac znaki spoza utf8mb3.

CREATE TABLE IF NOT EXISTS SigningJobs (
    Id INT(11) NOT NULL AUTO_INCREMENT,
    TokenHash CHAR(64) NOT NULL COMMENT 'SHA-256 (hex) tokenu zlecenia. Surowy token nie jest przechowywany.',
    LetterId INT(11) NOT NULL COMMENT 'Pismo, ktorego pliki zlecenie obejmuje.',
    CreatedByPersonId INT(11) NOT NULL COMMENT 'Kto zalozyl zlecenie. Tylko ta osoba widzi je w PS.',
    Status ENUM('created','preparing','prepared','finalizing','done','cancelled','expired','failed') NOT NULL DEFAULT 'created',
    MinProgramVersion VARCHAR(20) NOT NULL COMMENT 'Najstarsza wersja programu ENVI Podpis, ktora moze obsluzyc zlecenie (ustalona w chwili zalozenia).',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ExpiresAt DATETIME NOT NULL COMMENT 'Do kiedy token jest wazny (UTC).',
    PreparedAt DATETIME NULL COMMENT 'Kiedy serwer przygotowal pliki do podpisu (po zlozeniu certyfikatu).',
    FinishedAt DATETIME NULL COMMENT 'Kiedy zlecenie weszlo w stan koncowy (done/cancelled/expired/failed).',
    CancelReason VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Powod anulowania podany przez program albo uzytkownika.',
    FailureMessage VARCHAR(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'Komunikat dla uzytkownika, gdy zlecenie zakonczylo sie bledem.',
    CertSerial VARCHAR(64) NULL COMMENT 'Numer seryjny certyfikatu podpisujacego (hex, wielkie litery).',
    CertSubjectCn VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'CN podmiotu certyfikatu (imie i nazwisko podpisujacego).',
    CertIssuer VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT 'CN wystawcy certyfikatu.',
    CertChainJson MEDIUMTEXT NULL COMMENT 'Lancuch certyfikatow jako tablica JSON base64 DER, lisc pierwszy. NULL po zakonczeniu zlecenia.',
    CertChangedWarning TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = inny certyfikat niz pierwszy zapamietany dla tej osoby.',
    PRIMARY KEY (Id),
    UNIQUE KEY uq_signing_jobs_token_hash (TokenHash),
    KEY idx_signing_jobs_letter (LetterId),
    KEY idx_signing_jobs_created_by (CreatedByPersonId),
    KEY idx_signing_jobs_status_expires (Status, ExpiresAt),
    CONSTRAINT fk_signing_jobs_letter FOREIGN KEY (LetterId) REFERENCES Letters (Id) ON DELETE CASCADE,
    CONSTRAINT fk_signing_jobs_created_by FOREIGN KEY (CreatedByPersonId) REFERENCES Persons (Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_polish_ci;

-- Pierwszy certyfikat zobaczony dla osoby. Kolejny, inny certyfikat tej osoby daje ostrzezenie
-- w zleceniu (SigningJobs.CertChangedWarning), ale niczego nie blokuje.
CREATE TABLE IF NOT EXISTS PersonSigningCertificates (
    PersonId INT(11) NOT NULL,
    CertSerial VARCHAR(64) NOT NULL COMMENT 'Numer seryjny pierwszego zaakceptowanego certyfikatu osoby.',
    CertIssuerSha256 CHAR(64) NOT NULL COMMENT 'SHA-256 certyfikatu wystawcy; numer seryjny jest unikalny tylko u danego wystawcy.',
    CertSubjectCn VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
    FirstSeenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FirstJobId INT(11) NULL COMMENT 'Zlecenie, przy ktorym certyfikat zobaczono po raz pierwszy (NULL dla wgrania recznego).',
    PRIMARY KEY (PersonId),
    CONSTRAINT fk_person_signing_certificates_person FOREIGN KEY (PersonId) REFERENCES Persons (Id) ON DELETE CASCADE,
    CONSTRAINT fk_person_signing_certificates_job FOREIGN KEY (FirstJobId) REFERENCES SigningJobs (Id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_polish_ci;
