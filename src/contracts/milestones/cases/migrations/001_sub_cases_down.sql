DROP TABLE IF EXISTS CaseType_SubCaseTypes;

ALTER TABLE Cases
    DROP FOREIGN KEY FK_Cases_ParentCaseId,
    DROP COLUMN ParentCaseId;

ALTER TABLE CaseTypes
    DROP COLUMN IsSubCaseOnly,
    MODIFY COLUMN FolderNumber INT NULL;
