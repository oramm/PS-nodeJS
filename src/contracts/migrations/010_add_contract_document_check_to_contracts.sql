-- Migracja: wynik kontroli „czy wgrano umowę na Dysk"
-- Data: 2026-08-11
--
-- Kontrola cyklicznie zagląda do folderu sprawy, w której ma leżeć umowa (typ sprawy z env
-- CONTRACT_DOCUMENT_CASE_TYPE_IDS, domyślnie 85 „Umowa i zmiany" dla umów ENVI i 75 „Umowa"
-- dla umów wykonawców), i zapisuje tutaj wynik. Folder bierzemy z Cases.GdFolderId, NIGDY
-- ze ścieżki po nazwach: nazwy zależą od typu umowy i od słowników, a po migracji drzewa PS
-- ENVI na Dysk współdzielony (sierpień 2026) ścieżka wyprowadzona z nazw prowadzi w stare,
-- puste miejsce.
--
-- TRZY STANY, nie dwa — to jest powód, dla którego kolumna jest NULL-owalna:
--   1  = sprawdzono, w folderze (albo w jego podfolderze) jest co najmniej jeden plik;
--   0  = sprawdzono, nie ma nic — to jest brak umowy do uzupełnienia;
--   NULL = NIE sprawdzano. Umowa nie ma sprawy tego typu (ok. 166 z 785 — starsze umowy
--        o innej strukturze folderów, świadomie pomijane) albo kontrola jeszcze do niej
--        nie dotarła. NULL NIE ZNACZY „brak umowy" i nie wolno go tak wyświetlać.
--
-- ContractDocumentCheckedAt jest częścią odpowiedzi, a nie metadanymi: flaga bez daty nie
-- mówi, czy opisuje dzisiejszy stan, czy przebieg sprzed miesiąca, i nie tłumaczy, dlaczego
-- świeżo wgrana umowa nadal jest oznaczona jako brakująca. Dlatego obie kolumny zapisywane
-- są razem i razem czyszczone.
--
-- Przy błędzie po stronie Dysku (wygasły token, cofnięte uprawnienia, 5xx) kontrola NIE pisze
-- tutaj nic — poprzednia wartość zostaje. Zapisanie 0 zamieniłoby awarię dostępu w setki
-- fałszywych alarmów.
--
-- MariaDB 10.6 → ADD COLUMN IF NOT EXISTS (wzorzec 009_add_warranty_and_dnp_dates_to_contracts).

ALTER TABLE Contracts
    ADD COLUMN IF NOT EXISTS ContractDocumentPresent TINYINT(1) NULL
        COMMENT 'Wynik kontroli obecnosci umowy w folderze na Dysku: 1 = jest plik, 0 = folder pusty (brak do uzupelnienia), NULL = NIE sprawdzano (umowa bez sprawy typu umowa albo kontrola tu nie dotarla). NULL nie znaczy brak umowy.',
    ADD COLUMN IF NOT EXISTS ContractDocumentCheckedAt TIMESTAMP NULL
        COMMENT 'Kiedy kontrola ostatnio ustalila ContractDocumentPresent. Wyznacza tez kolejnosc kolejnych przebiegow (najdawniej sprawdzone ida pierwsze), wiec jest indeksowana.';

-- Kolejność przebiegu to „najdawniej sprawdzone pierwsze", z NULL na początku. Bez indeksu
-- każde wywołanie endpointu sortowałoby pełną tabelę umów.
CREATE INDEX IF NOT EXISTS idx_contracts_document_checked_at
    ON Contracts (ContractDocumentCheckedAt);
