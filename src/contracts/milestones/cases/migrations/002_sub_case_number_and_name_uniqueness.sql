-- SubCaseNumber: lokalna numeracja podspraw w ramach sprawy nadrzędnej.
-- ParentCaseIdForUnique: kolumna generowana do constraintu unikalności nazwy —
--   NULL (zwykła sprawa) → 0, podsprawa → jej ParentCaseId.
--   Rozwiązuje problem: dwie podsprawy o tej samej nazwie i typie w tym samym kamieniu,
--   ale różnych rodzicach, kolidowały ze starym UNIQUE(Name, TypeId, MilestoneId).

ALTER TABLE Cases ADD SubCaseNumber INT NULL AFTER Number;
UPDATE Cases SET SubCaseNumber = Number WHERE ParentCaseId IS NOT NULL;
CREATE UNIQUE INDEX uq_cases_parent_sub_case_number ON Cases (ParentCaseId, SubCaseNumber);
ALTER TABLE Cases DROP INDEX `Uniqe Name per CaseType`;
ALTER TABLE Cases ADD ParentCaseIdForUnique INT AS (COALESCE(ParentCaseId, 0)) PERSISTENT;
ALTER TABLE Cases ADD UNIQUE KEY `Unique Name per CaseType` (Name, TypeId, MilestoneId, ParentCaseIdForUnique);
