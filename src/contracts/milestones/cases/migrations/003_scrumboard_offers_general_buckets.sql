-- 003_scrumboard_offers_general_buckets.sql
--
-- Cel: umożliwić dodawanie zadań w scrumboardzie ("Aktualny Sprint") pod kontraktami-koszykami
--   121 = "Oferty" (ENV.OFE.01) oraz 122 = "Sprawy ogólne" (ENV.OGOLNE.01).
--   Te kontrakty świadomie omijają taksonomię typów (Contracts.TypeId = NULL,
--   kamienie mają MilestoneTypeId = NULL), więc nie miały gdzie zaczepić zadań.
--
-- Co robi:
--   1. Tworzy jeden dedykowany typ sprawy "Zadania" (koszyk), UNIKALNY per kamień
--      (IsUniquePerMilestone=1) i bez typu kamienia (MilestoneTypeId=NULL).
--      Unikalność => sprawa renderuje się WPROST pod kamieniem, bez dodatkowego folderu w UI.
--   2. Dla kontraktu 121 (Oferty): tworzy kamień "Oferty".
--   3. Dla KAŻDEGO kamienia kontraktów 121 i 122: tworzy jedną sprawę "Zadania" tego typu.
--
-- Wymaga: wdrożonej zmiany INNER JOIN -> LEFT JOIN na MilestoneTypes / MilestoneTypes_ContractTypes
--   w ContractsWithChildrenRepository (bez niej te koszyki i tak nie wyświetlą się w panelu).
--
-- Idempotentna: ponowne uruchomienie nie zdubluje typu/kamienia/spraw.

-- 1. Dedykowany typ sprawy-koszyka
INSERT INTO CaseTypes (Name, Description, IsDefault, IsUniquePerMilestone, IsSubCaseOnly, MilestoneTypeId, FolderNumber)
SELECT 'Zadania', '', 0, 1, 0, NULL, '00'
WHERE NOT EXISTS (
    SELECT 1 FROM CaseTypes WHERE Name = 'Zadania' AND MilestoneTypeId IS NULL
);

SET @bucketCaseTypeId := (
    SELECT Id FROM CaseTypes WHERE Name = 'Zadania' AND MilestoneTypeId IS NULL ORDER BY Id LIMIT 1
);

-- 2. Kontrakt 121 (Oferty): kamień
INSERT INTO Milestones (ContractId, TypeId, Name, Status)
SELECT 121, NULL, 'Oferty', 'W trakcie'
WHERE NOT EXISTS (SELECT 1 FROM Milestones WHERE ContractId = 121);

-- 3. Sprawa dla każdego kamienia kontraktów 121 i 122, który jej jeszcze nie ma.
--    Name = NULL: sprawa typu unikalnego bierze nazwę z typu (trigger NewCaseHandler
--    blokuje ręczną nazwę dla takich typów).
INSERT INTO Cases (MilestoneId, TypeId, Name, Number)
SELECT m.Id, @bucketCaseTypeId, NULL, 1
FROM Milestones m
WHERE m.ContractId IN (121, 122)
  AND NOT EXISTS (
      SELECT 1 FROM Cases ca WHERE ca.MilestoneId = m.Id AND ca.TypeId = @bucketCaseTypeId
  );
