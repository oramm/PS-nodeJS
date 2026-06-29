ALTER TABLE Cases DROP INDEX `Unique Name per CaseType`;
ALTER TABLE Cases DROP COLUMN ParentCaseIdForUnique;
ALTER TABLE Cases ADD UNIQUE KEY `Uniqe Name per CaseType` (Name, TypeId, MilestoneId);
DROP INDEX uq_cases_parent_sub_case_number ON Cases;
ALTER TABLE Cases DROP COLUMN SubCaseNumber;
