-- Migracja: koperta pisma przychodzącego — mail jako osobny rekord powiązany z pismem
-- Data: 2026-07-31
-- Plan: 20_projects/Aplikacje/PS.APP.01/plans/2026-07-31-prz-pisma-przychodzace-plan.md (PRZ-2)
-- Decyzja: PS.APP.01/decisions/2026-07-31-prz-0-bramki-pism-przychodzacych.md (G-PRZ-2)
--
-- MessageId to nagłówek RFC Message-ID wiadomości, NIE UID IMAP. UID jest per-folder i zmienia się
-- przy przeniesieniu wiadomości między folderami, więc nie nadaje się na klucz stabilny między
-- sesjami skanu (OfferInvitationMails.Uid ma tę wadę — tutaj świadomie nie powtarzamy wzorca).
--
-- UNIQUE na MessageId JEST całym mechanizmem „ten mail już przerobiony”: powtórzona rejestracja
-- odbija się o duplikat klucza, a trasa oddaje wtedy istniejącą kopertę z isNew=false. Nie ma
-- osobnej flagi „przerobiony” ani dodatkowego strażnika na Letters.
--
-- Osobna tabela, a nie kolumny na Letters ani pole JSON: jeden mail może dać kilka pism (klucz obcy
-- stoi po stronie pisma), a mail bez rozpoznanego pisma to poprawny wiersz bez pism (G-PRZ-5).

CREATE TABLE IF NOT EXISTS IncomingMails (
    `Id` int(11) NOT NULL AUTO_INCREMENT,
    `MessageId` varchar(255) NOT NULL COMMENT 'Naglowek RFC Message-ID wiadomosci. Klucz idempotencji skanu skrzynki: stabilny miedzy sesjami i miedzy folderami, w odroznieniu od UID IMAP.',
    `Account` varchar(100) NOT NULL COMMENT 'Skrzynka, z ktorej wiadomosc pobrano (parametr account MCP mail-imap-search, domyslnie envi).',
    `Subject` varchar(500) NOT NULL,
    `Body` mediumtext NOT NULL COMMENT 'Tresc wiadomosci. mediumtext, bo przy pustym sql_mode text ucinalby dluzsze watki po cichu.',
    `From` varchar(255) NOT NULL,
    `To` varchar(500) NOT NULL,
    `Date` datetime NOT NULL COMMENT 'Data wiadomosci w UTC (polaczenie aplikacji stoi na timezone +00:00).',
    `LastUpdated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
    `EditorId` int(11) DEFAULT NULL,
    PRIMARY KEY (`Id`),
    UNIQUE KEY `unique_message_id` (`MessageId`),
    KEY `IncomingMails_Person_ibfk` (`EditorId`),
    CONSTRAINT `IncomingMails_Person_ibfk` FOREIGN KEY (`EditorId`) REFERENCES `Persons` (`Id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_polish_ci;

ALTER TABLE Letters
    ADD COLUMN IF NOT EXISTS IncomingMailId int(11) DEFAULT NULL COMMENT 'Koperta pisma przychodzacego: mail, z ktorego pismo zarejestrowano. NULL przy pismach wychodzacych i przy pismach wprowadzonych recznie.';

ALTER TABLE Letters
    ADD CONSTRAINT `Letters_IncomingMail_ibfk` FOREIGN KEY IF NOT EXISTS (`IncomingMailId`) REFERENCES `IncomingMails` (`Id`) ON DELETE SET NULL ON UPDATE CASCADE;
