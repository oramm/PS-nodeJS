-- Rollback dla 013_create_chat_spaces.sql
--
-- UWAGA: kasuje przypisania umow do pokoi Google Chat i liste pokoi zapisana w PS.
-- Dane da sie odtworzyc tylko recznie. Przed uruchomieniem zrobic kopie:
--   SELECT Id, Number, ChatSpaceId FROM Contracts WHERE ChatSpaceId IS NOT NULL;
--   SELECT * FROM ChatSpaces;
-- Cofniecie schematu bez cofniecia kodu serwera skonczy sie bledem zapytania o ChatSpaceId.

ALTER TABLE Contracts
    DROP FOREIGN KEY IF EXISTS fk_contracts_chat_space;

ALTER TABLE Contracts
    DROP INDEX IF EXISTS idx_contracts_chat_space_id;

ALTER TABLE Contracts
    DROP COLUMN IF EXISTS ChatSpaceId;

DROP TABLE IF EXISTS ChatSpaces;
