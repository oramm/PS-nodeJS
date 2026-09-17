-- LIC-4A: optional link to license materials stored in Google Drive.
ALTER TABLE SoftwareLicenses
    ADD COLUMN GoogleDriveUrl TEXT NULL AFTER VendorPanelUrl;
