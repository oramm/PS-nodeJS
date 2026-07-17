-- Migracja: F1 — Nabywca FV (invoice buyer) na umowie our.
-- Data: 2026-07-16
-- Zakres: kolumna OurContractsData.InvoiceBuyerEntityId = opcjonalny FK do Entities.Id.
--   Klasa gmina+zaklad budzetowy (case Duszniki): Zamawiajacy umowy = zaklad (bez zmian,
--   AqmSync payload identyczny), nowe pole = Nabywca FV (Podmiot2 KSeF) = gmina.
--   Plan: 20_projects/Aplikacje/AQM.APP.01/plans/2026-07-16-psenvi-fv-nabywca-odbiorca-plan.md
--   Locked decisions D1 (kolumna + FK, NIE nowa rola w Contracts_Entities) i D5
--   (migracja addytywna, ADD COLUMN ... NULL, zero backfillu).
-- MariaDB 10.6. Wzorzec FK: FK_Cases_ParentCaseId (src/contracts/milestones/cases/migrations/001_sub_cases.sql).

ALTER TABLE OurContractsData
    ADD COLUMN InvoiceBuyerEntityId INT NULL
        COMMENT 'Nabywca FV (Podmiot2 KSeF) dla umow klasy JST — opcjonalny FK do Entities.Id.';

ALTER TABLE OurContractsData
    ADD CONSTRAINT FK_OurContractsData_InvoiceBuyerEntityId
        FOREIGN KEY (InvoiceBuyerEntityId) REFERENCES Entities(Id) ON DELETE RESTRICT;
