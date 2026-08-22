-- Rollback dla 011_add_is_leader_to_contracts_entities.sql
-- Uwaga: kasuje dane. Przed uruchomieniem zrobić backup wierszy ze znacznikiem ustawionym:
-- SELECT ContractId, EntityId, ContractRole, IsLeader FROM Contracts_Entities WHERE IsLeader = 1;

ALTER TABLE Contracts_Entities
    DROP COLUMN IF EXISTS IsLeader;
