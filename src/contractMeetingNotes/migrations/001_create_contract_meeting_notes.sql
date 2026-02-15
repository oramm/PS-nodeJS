-- Contract Meeting Notes metadata schema (N2-BACKEND-DATA-LAYER)
-- Date: 2026-02-15
-- Scope: metadata-only storage for contract meeting notes (search in DB only)

CREATE TABLE IF NOT EXISTS ContractMeetingNotes (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    ContractId INT NOT NULL,
    MeetingId INT NULL,
    SequenceNumber INT NOT NULL,
    Title VARCHAR(255) NOT NULL,
    Description TEXT NULL,
    MeetingDate DATETIME NULL,
    ProtocolGdId VARCHAR(255) NULL,
    CreatedByPersonId INT NULL,
    LastUpdated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_contractmeetingnotes_contract_sequence (ContractId, SequenceNumber),
    INDEX idx_contractmeetingnotes_contractid (ContractId),
    INDEX idx_contractmeetingnotes_meetingid (MeetingId),
    INDEX idx_contractmeetingnotes_meetingdate (MeetingDate),
    INDEX idx_contractmeetingnotes_protocolgdid (ProtocolGdId),
    INDEX idx_contractmeetingnotes_createdbypersonid (CreatedByPersonId),
    CONSTRAINT fk_contractmeetingnotes_contract
        FOREIGN KEY (ContractId) REFERENCES Contracts(Id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_contractmeetingnotes_meeting
        FOREIGN KEY (MeetingId) REFERENCES Meetings(Id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_contractmeetingnotes_createdbyperson
        FOREIGN KEY (CreatedByPersonId) REFERENCES Persons(Id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='Metadata for contract meeting notes generated from Google Docs templates';
