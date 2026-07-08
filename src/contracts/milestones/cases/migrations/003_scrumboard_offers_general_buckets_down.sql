-- 003_scrumboard_offers_general_buckets_down.sql
-- Wycofanie 003_scrumboard_offers_general_buckets.sql.
-- UWAGA: usuwa sprawy-koszyki tylko jeśli nie mają przypisanych zadań (Tasks),
--   żeby nie skasować danych wprowadzonych z UI.

SET @bucketCaseTypeId := (
    SELECT Id FROM CaseTypes WHERE Name = 'Zadania' AND MilestoneTypeId IS NULL ORDER BY Id LIMIT 1
);

-- 1. Sprawy-koszyki (tylko puste — bez zadań)
DELETE ca
FROM Cases ca
JOIN Milestones m ON m.Id = ca.MilestoneId
WHERE m.ContractId IN (121, 122)
  AND ca.TypeId = @bucketCaseTypeId
  AND NOT EXISTS (SELECT 1 FROM Tasks t WHERE t.CaseId = ca.Id);

-- 2. Kamień "Oferty" utworzony dla 121 (tylko jeśli nie ma już żadnych spraw)
DELETE FROM Milestones
WHERE ContractId = 121
  AND Name = 'Oferty'
  AND TypeId IS NULL
  AND NOT EXISTS (SELECT 1 FROM Cases c WHERE c.MilestoneId = Milestones.Id);

-- 3. Typ sprawy-koszyka (tylko jeśli już nieużywany)
DELETE FROM CaseTypes
WHERE Id = @bucketCaseTypeId
  AND NOT EXISTS (SELECT 1 FROM Cases c WHERE c.TypeId = CaseTypes.Id);
