-- Poziomy dostępu osoby do zasobów SB (repozytoria, poczta, baza PS, Dysk).
-- Kształt: {"repos":"none|read|write","psDb":"none|ro|rw","drive":"none|connector","mail":["kod",...]}.
-- NULL oznacza brak nadanych poziomów (wszystko 'none', poczta pusta). Kolumna nie trzyma sekretów.

ALTER TABLE SbAccess
    ADD COLUMN IF NOT EXISTS Levels JSON NULL COMMENT 'Poziomy dostępu do zasobów SB; NULL = brak; nigdy sekrety';

INSERT IGNORE INTO SbAccessActions (Code, Name) VALUES
    ('SET_LEVELS', 'Zmiana poziomow dostepu');
