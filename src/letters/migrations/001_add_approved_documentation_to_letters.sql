-- Migracja: Trwały stan „pismo dodane do Dokumentacji zatwierdzonej”
-- (żeby checkbox w formularzu edycji pokazywał aktualny stan).
-- Data: 2026-07-22

ALTER TABLE Letters
    ADD COLUMN IF NOT EXISTS AddedToApprovedDocumentation TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Czy pismo zostało dodane do rejestru „Dokumentacja zatwierdzona” (0=nie, 1=tak)';
