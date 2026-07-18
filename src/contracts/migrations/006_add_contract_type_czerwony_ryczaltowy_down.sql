-- Rollback dla 006_add_contract_type_czerwony_ryczaltowy.sql
-- Świadomie NIE zwężamy Name z powrotem do char(10): zwężenie mogłoby uciąć dane, gdyby
-- istniał już wiersz dłuższy niż 10 znaków (np. sam „Czerwony ryczałtowy"). Down usuwa tylko
-- dodany wiersz słownikowy; poszerzenie kolumny jest addytywne i bezpieczne do pozostawienia.

DELETE FROM ContractTypes WHERE Name = 'Czerwony ryczałtowy';
