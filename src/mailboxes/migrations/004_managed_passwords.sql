-- SKO-2: PS wylicza hasło skrzynki z sekretu serwera (MAILBOX_PASSWORD_SECRET) i numeru wersji.
-- PasswordVersion NULL = PS nie zna i nie zarządza hasłem (faktury@ i skrzynki sprzed przejścia).
-- AllEmployees = skrzynka ogólnofirmowa dla każdego pracownika i managera (K1); skrzynki projektu i kontraktu mają to z reguły.
-- Kopia NONE = skrzynka zarządzana nie ma kopii dla konta technicznego (K0).
ALTER TABLE Mailboxes
    ADD COLUMN PasswordVersion INT NULL,
    ADD COLUMN AllEmployees TINYINT(1) NOT NULL DEFAULT 0,
    MODIFY COLUMN AgentCopyStatus ENUM('PENDING', 'SET', 'NONE') NOT NULL DEFAULT 'PENDING';

-- Kto dostał którą wersję hasła zarządzanego. Osobno od SbAccessSecrets, bo blokada, zmiana poziomów i zmiana klucza
-- kasują tamte wiersze, a ślad posiadacza musi przetrwać do zmiany hasła. Bez FK do Persons z tego samego powodu.
CREATE TABLE IF NOT EXISTS MailboxPasswordHolders (
    MailboxId INT(11) NOT NULL,
    PersonId INT(11) NOT NULL,
    Version INT NOT NULL,
    IssuedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (MailboxId, PersonId),
    KEY idx_mailbox_password_holders_person (PersonId),
    CONSTRAINT fk_mailbox_password_holders_mailbox FOREIGN KEY (MailboxId) REFERENCES Mailboxes(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
