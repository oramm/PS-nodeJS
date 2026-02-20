-- Public Profile Submission: last link event metadata
-- Date: 2026-02-20

ALTER TABLE PublicProfileSubmissions
    ADD COLUMN LastLinkRecipientEmail VARCHAR(255) NULL AFTER Email,
    ADD COLUMN LastLinkEventAt DATETIME NULL AFTER LastLinkRecipientEmail,
    ADD COLUMN LastLinkEventType VARCHAR(32) NULL AFTER LastLinkEventAt,
    ADD COLUMN LastLinkEventByPersonId INT NULL AFTER LastLinkEventType,
    ADD INDEX idx_publicprofilesubmissions_last_link_event (LastLinkEventAt),
    ADD INDEX idx_publicprofilesubmissions_last_link_event_by (LastLinkEventByPersonId),
    ADD CONSTRAINT fk_publicprofilesubmissions_last_link_event_by
        FOREIGN KEY (LastLinkEventByPersonId) REFERENCES Persons(Id)
        ON DELETE SET NULL
        ON UPDATE CASCADE;
