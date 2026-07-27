-- Migracja: Cache folderu GD wspólnego dla spraw danego typu w danym kamieniu milowym
-- Dotyczy tylko typów spraw nieunikatowych (IsUniquePerMilestone=0) - dla unikatowych
-- folder typu = Cases.GdFolderId samej sprawy, więc nie ma potrzeby duplikować.
-- Data: 2026-07-23

CREATE TABLE IF NOT EXISTS CaseTypeFolders (
    MilestoneId INT NOT NULL,
    CaseTypeId INT NOT NULL,
    GdFolderId VARCHAR(191) NOT NULL,
    LastUpdated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (MilestoneId, CaseTypeId)
) COMMENT='Cache ID folderu GD typu sprawy per kamień milowy - unika powtarzanych lookupów w Drive API';
