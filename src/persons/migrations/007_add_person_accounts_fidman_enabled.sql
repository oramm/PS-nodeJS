-- Migracja: GLO-P1 — flaga „użytkownik FIDmana" przy koncie osoby.
-- Data: 2026-08-16
-- Zakres: kolumna PersonAccounts.FidmanEnabled = czy osoba ma konto w FIDmanie.
--   Dlaczego PersonAccounts, a nie Persons (rozstrzygnięte pomiarem w GLO-R0,
--   decisions/2026-08-16-glo-r0-ustalenia.md pkt 4): tu PS trzyma „konto osoby w systemach"
--   (SystemRoleId, SystemEmail, GoogleId, MicrosoftId), tu leży adres, który realnie jedzie
--   w payloadzie, i tędy i tak przechodzi zapis z formularza użytkownika systemowego.
--   Ścieżka zapisu v2 jest na produkcji żywa i bezwarunkowa, więc wariant awaryjny z D-GLO-4
--   („kolumna idzie na Persons") nie zachodzi.
--   Wartość 0 = stan zastany dla wszystkich 438 wierszy: powiązanie jest opt-in per osoba,
--   backfillu nie ma i mieć nie będzie (D-GLO-4).
--   UWAGA dla czytającego: PersonAccounts nie ma wiersza dla 1 z 179 osób z SystemEmail,
--   więc zapis flagi po stronie kodu MUSI być upsertem, nie updatem.
-- MariaDB 10.6 → ADD COLUMN IF NOT EXISTS (wzorzec 001_add_letters_shortcuts, 004_add_contracts_fidman_contract_id).

ALTER TABLE PersonAccounts
    ADD COLUMN IF NOT EXISTS FidmanEnabled TINYINT(1) NOT NULL DEFAULT 0
        COMMENT 'GLO-P1: 1 = osoba jest użytkownikiem FIDmana (logowanie kontem Google z SystemEmail). Odznaczenie wyłącza konto w FIDmanie, nigdy go nie kasuje.';
