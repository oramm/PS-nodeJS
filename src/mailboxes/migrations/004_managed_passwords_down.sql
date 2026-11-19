-- Cofniecie 004: PS zapomina wersje hasel, wiec skrzynek zarzadzanych nie zmieni juz bez recznego hasla.
DROP TABLE IF EXISTS MailboxPasswordHolders;
UPDATE Mailboxes SET AgentCopyStatus = 'PENDING' WHERE AgentCopyStatus = 'NONE';
ALTER TABLE Mailboxes
    MODIFY COLUMN AgentCopyStatus ENUM('PENDING', 'SET') NOT NULL DEFAULT 'PENDING',
    DROP COLUMN AllEmployees,
    DROP COLUMN PasswordVersion;
