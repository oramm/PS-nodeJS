-- Migracja: rękojmia i koniec Okresu Zgłaszania Wad jako osobne terminy umowne
-- Data: 2026-08-10
--
-- Do tej pory Contracts trzymały jeden termin pogwarancyjny (GuaranteeEndDate). Umowa ma ich
-- więcej i są to różne instytucje prawne: gwarancja jest umowna, rękojmia ustawowa, a Okres
-- Zgłaszania Wad (FIDIC Defects Notification Period) to termin kontraktowy występujący wyłącznie
-- w umowach na roboty w trybie Żółtym i Czerwonym. Trzymanie ich w jednej kolumnie kasowałoby
-- informację, który termin właściwie upływa.
--
-- Obie kolumny NULL i bez wartości domyślnej: brak terminu to stan poprawny, nie brak danych.
-- Umowy historyczne nie mają skąd tych dat wziąć, a rejestracja nowej umowy ma być możliwa,
-- zanim terminy są znane (decyzja właściciela: pola nieobowiązkowe).
--
-- DefectsNotificationEndDate NIE jest ograniczona do typów Żółty/Czerwony na poziomie bazy.
-- Reguła „tylko te dwa typy” jest domenowa i pilnuje jej formularz — dokładnie tak samo jak
-- przy SettlementMethod w 008. Baza, która wymusza regułę domenową, wywala import i backfill
-- przy pierwszym wyjątku od reguły.
--
-- MariaDB 10.6 → ADD COLUMN IF NOT EXISTS (wzorzec 001_add_letters_shortcuts_in_subfolder.sql).

ALTER TABLE Contracts
    ADD COLUMN IF NOT EXISTS WarrantyEndDate DATE NULL
        COMMENT 'Koniec rekojmi za wady (instytucja ustawowa, odrebna od gwarancji w GuaranteeEndDate). Dotyczy wszystkich typow umow. NULL = termin nieustalony albo nieznany, NIE brak rekojmi.',
    ADD COLUMN IF NOT EXISTS DefectsNotificationEndDate DATE NULL
        COMMENT 'Koniec Okresu Zglaszania Wad (FIDIC Defects Notification Period). Wypelniany wylacznie dla umow na roboty typu Zolty i Czerwony; ograniczenie jest domenowe (formularz), nie bazodanowe. NULL = termin nieustalony albo typ umowy go nie ma.';
