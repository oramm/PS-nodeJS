-- Szyfrowane hasła udostępniane pracownikowi (plan SBD, checkpoint SBD-2).
-- Klucz publiczny komputera osoby (RSA 2048, JWK) i token urządzenia, którym instalator SB
-- wchodzi do PS bez przeglądarki. Z tokenu w bazie jest tylko skrót SHA-256.
-- SbAccessSecrets trzyma wyłącznie szyfrogram RSA-OAEP-SHA256 (base64, 256 bajtów);
-- jawnej wartości PS nigdy nie zna. Nazwy haseł wynikają z poziomów dostępu (stała reguła w kodzie).

ALTER TABLE SbAccess
    ADD COLUMN IF NOT EXISTS PublicKeyJwk JSON NULL COMMENT 'Klucz publiczny komputera osoby (JWK RSA 2048: kty, n, e); NULL = brak',
    ADD COLUMN IF NOT EXISTS PublicKeySetAt DATETIME NULL COMMENT 'Czas ustawienia klucza publicznego',
    ADD COLUMN IF NOT EXISTS DeviceTokenHash CHAR(64) NULL COMMENT 'SHA-256 (hex) tokenu urządzenia z paczki instalatora; nigdy sam token',
    ADD COLUMN IF NOT EXISTS DeviceTokenIssuedAt DATETIME NULL COMMENT 'Czas wydania tokenu urządzenia (pobranie instalatora)';

CREATE TABLE IF NOT EXISTS SbAccessSecrets (
    Id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'Identyfikator wpisu hasła',
    PersonId INT(11) NOT NULL COMMENT 'Osoba, dla której zaszyfrowano hasło',
    Name VARCHAR(60) NOT NULL COMMENT 'Nazwa hasła, np. poczta-faktury, baza-ps',
    Ciphertext VARCHAR(400) NOT NULL COMMENT 'Szyfrogram RSA-OAEP-SHA256 (base64); nigdy jawne hasło',
    SharedByPersonId INT(11) NULL COMMENT 'Kto udostępnił; NULL po usunięciu osoby',
    CreatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Czas pierwszego udostępnienia',
    UpdatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Czas ostatniej zmiany',
    UNIQUE KEY uq_sbaccesssecrets_person_name (PersonId, Name),
    KEY idx_sbaccesssecrets_sharedby (SharedByPersonId),
    CONSTRAINT fk_sbaccesssecrets_person FOREIGN KEY (PersonId) REFERENCES Persons(Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_sbaccesssecrets_sharedby FOREIGN KEY (SharedByPersonId) REFERENCES Persons(Id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO SbAccessActions (Code, Name) VALUES
    ('SET_KEY', 'Ustawienie klucza komputera'),
    ('GIVE_SECRET', 'Udostepnienie hasla (szyfrogram)'),
    ('TAKE_SECRET', 'Odebranie hasla'),
    ('ISSUE_TOKEN', 'Wydanie tokenu urzadzenia (pobranie instalatora)');
