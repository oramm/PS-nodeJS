-- Migracja: TY-1 — nowy typ kontraktu „Czerwony ryczałtowy" w słowniku ContractTypes.
-- Data: 2026-07-17
-- Decyzja: 20_projects/Aplikacje/FID.APP.01/decisions/2026-07-17-ps-typ-czerwony-ryczaltowy.md
-- Plan: 20_projects/Aplikacje/FID.APP.01/plans/2026-07-17-ps-typ-rozliczenia-plan.md (TY-1).
-- Zakres (dwa kroki):
--   a) Poszerzenie ContractTypes.Name char(10) -> VARCHAR(30). Powód: kanoniczna nazwa
--      „Czerwony ryczałtowy" (19 znaków) nie mieści się w char(10). UNIQUE zachowany,
--      zero zmian istniejących 12 wartości (poszerzenie jest addytywne). Owner OPCJA A
--      (poszerz kolumnę, NIE dodawaj osobnej kolumny metody rozliczenia).
--   b) INSERT nowego wiersza słownikowego (IsOur=0, Status='ACTIVE'). Idempotentny —
--      guard WHERE NOT EXISTS na unikalnej nazwie (bezpieczny ponowny run).
-- Oś FIDIC pozostaje odtwarzalna z enuma: „Czerwony ryczałtowy" implikuje czerwony-FIDIC.
-- MariaDB/MySQL. Istniejące id/nazwy (Żółty=3, Czerwony=4) nietykalne.

ALTER TABLE ContractTypes MODIFY Name VARCHAR(30) NOT NULL;

INSERT INTO ContractTypes (Name, Description, Status, IsOur)
SELECT 'Czerwony ryczałtowy',
       'Kontrakt na roboty w trybie &gt;&gt;buduj&lt;&lt; (projekt zamawiającego), rozliczany ryczałtem. Nie musi to być FIDIC.',
       'ACTIVE',
       0
WHERE NOT EXISTS (
    SELECT 1 FROM ContractTypes WHERE Name = 'Czerwony ryczałtowy'
);
