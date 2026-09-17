-- Destructive rollback: removes stored Google Drive links.
ALTER TABLE SoftwareLicenses
    DROP COLUMN GoogleDriveUrl;
