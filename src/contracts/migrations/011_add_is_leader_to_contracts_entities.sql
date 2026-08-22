-- Migracja: znacznik lidera konsorcjum na powiązaniu kontrakt-podmiot
-- Data: 2026-08-22
--
-- Kontekst: przy kontraktach z wieloma wykonawcami (konsorcjach) PS nie zapisywał, która firma
-- jest liderem. Nazwa folderu kontraktu na Dysku wzorem "K <alias> <skrót wykonawcy>" brała
-- pierwszego wykonawcę z listy, a "pierwszy" nie znaczyło nic — przy odczycie z bazy to porządek
-- alfabetyczny, przy zapisie z klienta to kolejność w żądaniu.
--
-- Znacznik siedzi na wierszu Contracts_Entities (powiązanie kontrakt-podmiot), NIE jako pole
-- kontraktu i NIE jako nowa wartość w enum ContractRole. Powiązania są przy każdej edycji
-- kontraktu kasowane i dopisywane od nowa, więc znacznik siedzący na wierszu umiera razem z nim
-- i nie ma jak się zestarzeć. Wartość 'CONTRACTOR' w enum ContractRole jest porównywana przez
-- równość w wielu miejscach kodu (w tym mapowanie ról do FIDmana) — nowa wartość roli
-- zniknęłaby po cichu z listy wykonawców wszędzie tam. Pełne uzasadnienie i odrzucone warianty:
-- 20_projects/Aplikacje/PS.APP.01/plans/2026-08-22-ldr-lider-konsorcjum-plan.md, decyzja D-1.
--
-- Ten checkpoint (LDR-1) dokłada wyłącznie miejsce w schemacie. Zero zmian w zachowaniu programu:
-- kolumna jest nieobowiązkowa, domyślnie wyłączona (0), i żaden istniejący ani nowy zapis jej
-- jeszcze nie ustawia. Zapis/odczyt przez API i sortowanie "lider najpierw" to LDR-2.
--
-- MariaDB 10.6 → ADD COLUMN IF NOT EXISTS (wzorzec 001_add_letters_shortcuts_in_subfolder.sql).

ALTER TABLE Contracts_Entities
    ADD COLUMN IF NOT EXISTS IsLeader TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Czy ten podmiot jest liderem konsorcjum przy tym kontrakcie (0=nie/nieustalone, 1=tak). Dotyczy wyłącznie wykonawców (ContractRole=CONTRACTOR); brak znacznika to stan normalny, nie brak danych.';
