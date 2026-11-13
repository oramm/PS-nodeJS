-- MBX-3: rezerwacja adresu przed założeniem skrzynki i trwały wybór osób kontraktu.
INSERT IGNORE INTO MailboxStatuses (Code, Name) VALUES ('PENDING', 'Do założenia');

ALTER TABLE Mailboxes
    ADD COLUMN LastError VARCHAR(500) NULL,
    ADD COLUMN CreatedByPersonId INT(11) NULL,
    ADD CONSTRAINT fk_mailboxes_created_by FOREIGN KEY (CreatedByPersonId) REFERENCES Persons(Id),
    ADD UNIQUE KEY uq_mailboxes_project (ProjectId),
    ADD UNIQUE KEY uq_mailboxes_contract (ContractId);

-- Bez kaskad: usunięcie kontraktu albo osoby wymaga jawnego usunięcia przypisania.
CREATE TABLE IF NOT EXISTS ContractSelectedPersons (
    ContractId INT(11) NOT NULL,
    PersonId INT(11) NOT NULL,
    PRIMARY KEY (ContractId, PersonId),
    KEY idx_contract_selected_person (PersonId),
    CONSTRAINT fk_contract_selected_contract FOREIGN KEY (ContractId) REFERENCES Contracts(Id),
    CONSTRAINT fk_contract_selected_person FOREIGN KEY (PersonId) REFERENCES Persons(Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
