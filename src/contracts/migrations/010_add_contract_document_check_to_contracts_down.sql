-- Rollback dla 010_add_contract_document_check_to_contracts.sql
-- Kasuje wyłącznie wynik kontroli, którą da się odtworzyć jednym pełnym przebiegiem
-- (POST /contracts/documentsCheck w pętli), więc utrata danych jest tu odwracalna
-- inaczej niż przy 009. Backup przed uruchomieniem nie jest konieczny.

ALTER TABLE Contracts
    DROP INDEX IF EXISTS idx_contracts_document_checked_at,
    DROP COLUMN IF EXISTS ContractDocumentPresent,
    DROP COLUMN IF EXISTS ContractDocumentCheckedAt;
