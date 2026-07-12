-- =====================================================
-- Rollback migracji 004: Usuniecie statusu weryfikacji
-- Bialej Listy z faktur kosztowych
-- =====================================================

ALTER TABLE CostInvoices
    DROP INDEX idx_white_list_status,
    DROP COLUMN WhiteListCheckedAt,
    DROP COLUMN WhiteListRequestId,
    DROP COLUMN WhiteListStatus;
