-- Rollback dla 008_add_settlement_method_to_contracts.sql
-- Uwaga: kasuje dane. Metoda rozliczenia po backfillu (RZL-2) nie jest odtwarzalna z FIDmana
-- automatycznie — źródło prawdy przechodzi do PS i człowiek edytuje pole tutaj. Przed uruchomieniem
-- zrobić backup kolumny: SELECT Id, SettlementMethod FROM Contracts WHERE SettlementMethod IS NOT NULL.

ALTER TABLE Contracts
    DROP COLUMN IF EXISTS SettlementMethod;
