-- Migracja: Flaga folderu "Dokumentacja zatwierdzona" w kamieniu projektowanie - nadzór (per kontrakt)
-- Data: 2026-07-22

ALTER TABLE Contracts
    ADD COLUMN IF NOT EXISTS ApprovedDocumentation TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Czy dla kontraktu tworzyć folder "04 Dokumentacja zatwierdzona" w kamieniach projektowanie-nadzór i pokazywać opcję przy pismach (0=nie, 1=tak)';
