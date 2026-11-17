-- Migracja: pliki zlecenia podpisu (SIG-2)
-- Data: 2026-10-09
--
-- Kontekst: jedno zlecenie (SigningJobs) obejmuje kilka plikow - samo pismo i wybrane zalaczniki.
-- Kazdy plik ma wlasny podpis. Serwer "zamraza" tresc przy skladaniu certyfikatu: PreparedPdf to
-- dokladnie te bajty, ktore dostana podpis (plus sam podpis), wiec pozniejsza edycja dokumentu
-- Google nie moze sie wcisnac. SignedAttrsDer to atrybuty, ktorych skrot podpisuje karta.
-- PreparedPdf i SignedAttrsDer sa czyszczone (NULL) po zakonczeniu albo wygasnieciu zlecenia -
-- zostaja metadane i identyfikator podpisanego pliku.
--
-- SourceKind: LETTER_DOC = Dokument Google pisma (eksportowany do PDF), DRIVE_FILE = plik z folderu
--   pisma (PDF albo Dokument/Arkusz Google eksportowany do PDF).
-- FileIndex: 0-based, w kolejnosci wyslanej przez uzytkownika; program odsyla podpisy po tym indeksie.
--
-- Rozmiar: PreparedPdf to LONGBLOB, ale aplikacja odrzuca pliki powyzej limitu (SigningJobsConfig),
-- zeby nie przekroczyc max_allowed_packet.

CREATE TABLE IF NOT EXISTS SigningJobFiles (
    Id INT(11) NOT NULL AUTO_INCREMENT,
    JobId INT(11) NOT NULL,
    FileIndex INT(11) NOT NULL COMMENT 'Pozycja pliku w zleceniu, od 0.',
    SourceKind ENUM('LETTER_DOC','DRIVE_FILE') NOT NULL,
    SourceGdFileId VARCHAR(100) NOT NULL COMMENT 'Id pliku na Dysku Google, z ktorego powstaje PDF do podpisu.',
    DisplayName VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Nazwa zrodla w chwili zalozenia zlecenia (baza nazwy pliku wynikowego).',
    WithGraphic TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = widoczna grafika podpisu w PDF.',
    PreparedPdf LONGBLOB NULL COMMENT 'Zamrozony PDF z zarezerwowanym miejscem na podpis. NULL po zakonczeniu zlecenia.',
    SignedAttrsDer BLOB NULL COMMENT 'Atrybuty podpisywane (DER), z ktorych liczony jest skrot dla karty. NULL po zakonczeniu zlecenia.',
    CheckCode CHAR(9) NULL COMMENT 'Kod kontrolny XXXX-XXXX ze skrotu; ten sam widzi uzytkownik w PS i w programie.',
    Pages INT(11) NULL,
    SignedGdFileId VARCHAR(100) NULL COMMENT 'Id podpisanego pliku na Dysku po udanym zleceniu.',
    SignedName VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
    PRIMARY KEY (Id),
    UNIQUE KEY uq_signing_job_files_job_index (JobId, FileIndex),
    CONSTRAINT fk_signing_job_files_job FOREIGN KEY (JobId) REFERENCES SigningJobs (Id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_polish_ci;
