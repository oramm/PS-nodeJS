-- MBX-4: istniejące skrzynki także czekają na jawne ustawienie kopii.
ALTER TABLE Mailboxes
    ADD COLUMN AgentCopyStatus ENUM('PENDING', 'SET') NOT NULL DEFAULT 'PENDING',
    ADD COLUMN AgentCopyLastError VARCHAR(500) NULL;
