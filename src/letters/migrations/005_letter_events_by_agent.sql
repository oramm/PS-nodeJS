-- Znak "zapisal agent" przy zdarzeniu pisma (plan SBZ, checkpoint SBZ-1).
-- Agent pracownika dziala jako ta osoba (EditorId = osoba), wiec samo konto autora
-- nie mowi juz, ze pismo zalozyl agent. 0 = czlowiek albo zdarzenie sprzed SBZ;
-- agent wlasciciela (agent@ps.envi.com.pl) jest dalej rozpoznawany po koncie.

ALTER TABLE LetterEvents
    ADD COLUMN IF NOT EXISTS IsByAgent TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = zdarzenie zapisal agent osoby (SBZ)';
