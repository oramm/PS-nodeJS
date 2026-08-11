-- Rollback dla 009_add_warranty_and_dnp_dates_to_contracts.sql
-- Uwaga: kasuje dane. Oba terminy wpisuje człowiek z treści umowy i nie da się ich odtworzyć
-- z żadnego innego źródła w systemie. Przed uruchomieniem zrobić backup:
-- SELECT Id, WarrantyEndDate, DefectsNotificationEndDate FROM Contracts
--   WHERE WarrantyEndDate IS NOT NULL OR DefectsNotificationEndDate IS NOT NULL;

ALTER TABLE Contracts
    DROP COLUMN IF EXISTS WarrantyEndDate,
    DROP COLUMN IF EXISTS DefectsNotificationEndDate;
