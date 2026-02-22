-- Contract Meeting Notes schema update
-- Date: 2026-02-22
-- Scope: add Google document metadata columns used by ContractMeetingNote model

ALTER TABLE ContractMeetingNotes
    ADD COLUMN IF NOT EXISTS GdDocumentId VARCHAR(255) NULL AFTER ProtocolGdId,
    ADD COLUMN IF NOT EXISTS GdDocumentUrl VARCHAR(1024) NULL AFTER GdDocumentId;

CREATE INDEX IF NOT EXISTS idx_contractmeetingnotes_gddocumentid
    ON ContractMeetingNotes (GdDocumentId);
