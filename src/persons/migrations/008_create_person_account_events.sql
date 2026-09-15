-- Migracja: ROD-3 (pack ROD, decyzja D-ROD-5 wariant (a)) — zdarzenia konta osoby: kto, kiedy, co zmienił.
-- Data: 2026-09-08
-- Zakres: NOWA tabela PersonAccountEvents. Migracja wyłącznie dodająca — nie zmienia ani nie kasuje
--   niczego w istniejących tabelach; bezpieczna do auto-uruchomienia na wydaniu razem z kodem,
--   który do niej pisze (kod bez tabeli nie zadziała, tabela bez kodu nikomu nie szkodzi).
--   Jeden wiersz = jedna zmieniona wartość konta (rola, e-mail logowania, aktywność konta,
--   flaga FIDmana, zakres projektów, flagi panelu), z autorem z sesji i wartością przed/po jako JSON.
--   Dlaczego osobna tabela, a nie kolumny „kto/kiedy" w koncie (D-ROD-5): kolumny pokazałyby tylko
--   ostatnią zmianę; tu zostaje pełna historia — tak jak przy pismach (LetterEvents) i ofertach.
--   Klucze obce jak w LetterEvents: PersonId ON DELETE CASCADE (historia konta idzie za osobą),
--   EditorId ON DELETE SET NULL (skasowanie/anonimizacja AUTORA nie kasuje cudzej historii).
--   Pisze wyłącznie kontroler, w tej samej transakcji co zmiana (decyzja techniczna planu ROD).
-- MariaDB 10.6 -> CREATE TABLE IF NOT EXISTS (wzorzec 001_create_persons_v2_schema).

CREATE TABLE IF NOT EXISTS PersonAccountEvents (
    Id INT(11) NOT NULL AUTO_INCREMENT,
    PersonId INT(11) NOT NULL COMMENT 'Osoba, której konto zmieniono',
    EditorId INT(11) DEFAULT NULL COMMENT 'Autor zmiany (osoba z sesji); NULL po skasowaniu autora',
    EventType VARCHAR(50) NOT NULL COMMENT 'ACCOUNT | PROJECT_ASSIGNMENTS | STAFF_FLAGS',
    Field VARCHAR(50) NOT NULL COMMENT 'Zmienione pole: systemRoleId, systemEmail, isActive, fidmanEnabled, projectOurIds, isDriver, ...',
    ValueBefore TEXT DEFAULT NULL COMMENT 'Wartość przed zmianą (JSON)',
    ValueAfter TEXT DEFAULT NULL COMMENT 'Wartość po zmianie (JSON)',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (Id),
    KEY idx_personaccountevents_person_created (PersonId, CreatedAt),
    KEY idx_personaccountevents_editor (EditorId),
    CONSTRAINT fk_personaccountevents_person FOREIGN KEY (PersonId) REFERENCES Persons(Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_personaccountevents_editor FOREIGN KEY (EditorId) REFERENCES Persons(Id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='ROD-3: historia zmian konta osoby (kto, kiedy, co)';
