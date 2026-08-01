-- Migracja: rekord ostatniego skanu skrzynki — okno czasowe dla skanu pism przychodzących
-- Data: 2026-08-01
-- Plan: 20_projects/Aplikacje/PS.APP.01/plans/2026-07-31-prz-pisma-przychodzace-plan.md (PRZ-5)
-- Notatka: PS.APP.01/notes/2026-08-01-znacznik-ostatniego-skanu.md
--
-- Po co osobny rekord, skoro UNIQUE (MessageId) już chroni przed drugą rejestracją: chroni przed
-- drugim ZAPISEM, nie przed drugim ODCZYTEM. Bez okna czasowego agent co przebieg pobiera i czyta
-- całą historię skrzynki, po czym grzecznie odrzuca duplikaty — poprawnie i drogo.
--
-- Klucz (Account, Mailbox), nie (Account, Mailbox, EditorId): znacznik należy do skrzynki, nie do
-- osoby. Skan odpala kilka osób z własnych kont; przy kluczu z osobą każda miałaby własną prawdę
-- o tej samej skrzynce i przemiatała cudzą robotę od nowa. Owner 2026-08-01.
--
-- Odrzucone: znacznik wyprowadzony z MAX(IncomingMails.Date) — bez nowej tabeli, ale niewidoczny
-- (trzeba go policzyć) i nie odróżnia „przeskanowano, nic nie było" od „nie skanowano".

CREATE TABLE IF NOT EXISTS MailScans (
    `Id` int(11) NOT NULL AUTO_INCREMENT,
    `Account` varchar(100) NOT NULL COMMENT 'Alias skrzynki (parametr account MCP mail-imap-search, domyslnie envi).',
    `Mailbox` varchar(255) NOT NULL COMMENT 'Folder skrzynki, np. INBOX.',
    `ScannedUntil` datetime NOT NULL COMMENT 'Granica faktycznie przetworzonego okna. Przesuwa sie WYLACZNIE do przodu i nigdy poza chwile biezaca - patrz MailScanRepository.advance.',
    `LastRunAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT 'Kiedy ostatni zakonczony przebieg przesunal znacznik.',
    `EditorId` int(11) DEFAULT NULL COMMENT 'Kto odpalil ostatni zakonczony przebieg.',
    PRIMARY KEY (`Id`),
    UNIQUE KEY `unique_account_mailbox` (`Account`, `Mailbox`),
    KEY `MailScans_Person_ibfk` (`EditorId`),
    CONSTRAINT `MailScans_Person_ibfk` FOREIGN KEY (`EditorId`) REFERENCES `Persons` (`Id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_polish_ci;
