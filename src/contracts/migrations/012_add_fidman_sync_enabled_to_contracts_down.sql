-- Rollback dla 012_add_fidman_sync_enabled_to_contracts.sql
--
-- UWAGA: kasuje dane, których NIE da się odtworzyć przebiegiem żadnego skryptu. Znacznik
-- „Objęta synchronizacją" jest decyzją człowieka o każdej umowie z osobna, a nie wynikiem
-- kontroli — inaczej niż ContractDocumentPresent z migracji 010, którą wystarczy przeliczyć
-- od nowa. Przed uruchomieniem zrobić kopię wierszy z włączonym znacznikiem:
--   SELECT Id, Number, ProjectOurId, FidmanSyncEnabled FROM Contracts WHERE FidmanSyncEnabled = 1;
--
-- Skutek uboczny, o którym trzeba wiedzieć przed cofnięciem: bez tej kolumny bramka wysyłki
-- wraca do stanu „decyduje sam typ umowy", czyli KAŻDA umowa typu z allowlisty znów pojedzie
-- do FIDmana przy pierwszej edycji — także te, które świadomie wykluczono. Cofnięcie schematu
-- bez cofnięcia kodu serwera skończy się błędem zapytania, nie cichym powrotem starej zasady.

ALTER TABLE Contracts
    DROP COLUMN IF EXISTS FidmanSyncEnabled;
