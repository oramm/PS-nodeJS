-- Najpierw trzeba ręcznie rozstrzygnąć skrzynki PENDING; FK odmówi usunięcia używanego stanu.
DELETE FROM MailboxStatuses WHERE Code = 'PENDING';

DROP TABLE IF EXISTS ContractSelectedPersons;

ALTER TABLE Mailboxes
    DROP FOREIGN KEY fk_mailboxes_created_by,
    DROP COLUMN CreatedByPersonId,
    DROP INDEX uq_mailboxes_project,
    DROP INDEX uq_mailboxes_contract,
    DROP COLUMN LastError;
