-- Rollback dla 005_add_invoice_buyer_to_our_contracts.sql

ALTER TABLE OurContractsData
    DROP FOREIGN KEY FK_OurContractsData_InvoiceBuyerEntityId;

ALTER TABLE OurContractsData
    DROP COLUMN InvoiceBuyerEntityId;
