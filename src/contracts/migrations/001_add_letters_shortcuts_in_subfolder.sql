-- Migracja: Flaga tworzenia skrótów do pism w podfolderze "Pisma" (per kontrakt)
-- Data: 2026-06-23

ALTER TABLE Contracts
    ADD COLUMN IF NOT EXISTS LettersShortcutsInSubfolder TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Czy skróty do pism mają być tworzone w podfolderze Pisma (0=nie, 1=tak)';
