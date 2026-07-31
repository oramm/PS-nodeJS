-- Migracja: Metoda rozliczenia robót jako osobna oś danych (per kontrakt)
-- Data: 2026-07-31
-- Plan: 20_projects/Aplikacje/PS.APP.01/plans/2026-07-29-rzl-metoda-rozliczenia-plan.md (RZL-1)
--
-- TypeId (tryb FIDIC: Żółty=projektuj-i-buduj, Czerwony=buduj) NIE jest tą samą cechą co metoda
-- rozliczenia. Podtyp w słowniku ContractTypes został odrzucony, bo nie dziedziczy zachowania typu
-- bazowego: wypada z MilestoneTypes_ContractTypes (numeracja folderów korespondencji) i z allowlisty
-- FIDMAN_SYNC_CONTRACT_TYPE_IDS. Decyzja: PS.APP.01/decisions/2026-07-31-rzl-metoda-rozliczenia-osobna-os.md

ALTER TABLE Contracts
    ADD COLUMN IF NOT EXISTS SettlementMethod ENUM('LUMP_SUM','MEASUREMENT') NULL COMMENT 'Metoda rozliczenia robot: LUMP_SUM=ryczalt, MEASUREMENT=obmiar. Dziedzina ma dwie wartosci; kontrakt mieszany wpisujemy wg przewazajacej. NULL = jeszcze nie wpisano, NIE trzeci stan domenowy. Os niezalezna od TypeId (tryb FIDIC). Zrodlo prawdy = PS (przejete z FIDman surveytype backfillem 2026-07, bez auto-synca).';
