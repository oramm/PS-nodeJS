# RODO - przegląd osób bez powiązań

## Cel

Okresowo znaleźć w książce adresowej PS ENVI osoby, których nic w systemie nie trzyma, i świadomie
zdecydować, co z nimi zrobić. **Nic nie kasuje się automatycznie** - decyzja ownera z planu RODO
(pack ROD, `D-ROD-4`, 2026-09-08): raport + przegląd ręczny, bez automatu, bo okres retencji danych
to decyzja prawno-biznesowa, której firma jeszcze nie spisała.

## Kto, kiedy

- Administrator systemu (rola ADMIN) z dostępem do bazy produkcyjnej z laptopa - tak samo jak przy
  `yarn persons:legacy-report`.
- Rytm nie jest ustalony (brak polityki retencji). Do jej spisania: przy porządkach w książce adresowej
  i po zakończeniu większych kontraktów; propozycja - raz na kwartał.

## Co znaczy „bez powiązań"

Na listę trafia osoba, która spełnia cztery kryteria planu naraz: nie ma roli na żadnym kontrakcie
(Zamawiający / Inżynier / Wykonawca), nie ma konta z e-mailem logowania, nie ma wiersza uprawnień
w panelu i nie ma profilu. Wiersz konta **bez** e-maila nie jest powiązaniem - po migracji z lutego 2026
ma go prawie każda osoba.

Przy każdej osobie skrypt dopisuje **ślady**: gdzie jeszcze w bazie występuje jej numer (pisma, oferty,
zadania, nieobecności, faktury...). Listę miejsc skrypt bierze sam z metadanych bazy (klucze obce do
tabeli osób) plus pięć kolumn edytora bez klucza - nie utrzymuj jej ręcznie w tym dokumencie.
`ślady=brak` znaczy: nic w systemie tej osoby nie trzyma.

Pomiar odniesienia: 158 osób na kopii bazy z czerwca 2026 (pomiar 2026-09-07), wszystkie bez śladów.

## Krok 1 - uruchom raport

Lokalnie (kopia bazy):

```bash
yarn persons:unlinked-report
```

Produkcja (z laptopa z produkcyjnym `.env`; skrypt tylko czyta):

```bash
cross-env NODE_ENV=production ts-node src/scripts/persons-unlinked-report.ts
```

Pierwsza linia wyjścia mówi, którą bazę czytasz (`env=... db=...`) - sprawdź ją, bo bez `NODE_ENV`
domyślną bazą jest produkcja.

Dwa tryby wyjścia:

- **domyślny** - same numery osób i podmiotów, data wiersza konta, ślady. Ten wynik wolno wkleić do
  notatki z przeglądu.
- **`--review`** - dodatkowo imię, nazwisko, stanowisko i nazwa podmiotu (kolumny rozdzielone
  tabulatorem). Tylko na ekran albo do pliku lokalnego (`... --review > osoby-do-przegladu.tsv`,
  otwórz w arkuszu). **Nie wklejaj tego wyniku do notatek, zgłoszeń, maili ani czatów; plik skasuj
  po przeglądzie.**

## Krok 2 - przejrzyj partiami, po podmiocie

Lista jest posortowana po nazwie podmiotu. Kolumna `konto` to data ostatniego zapisu pustego wiersza
konta - **nie** data zmiany osoby (tabela osób nie ma kolumny daty); dla osób sprzed lutego 2026 to
dzień migracji, więc nie mówi nic o tym, czy osoba jest „świeża". Oceniaj po podmiocie (czy firma jest
nadal klientem lub partnerem) i po stanowisku.

Dla każdej osoby jedna z trzech decyzji:

1. **Zostaw** - podmiot aktywny, osoba może wrócić do kontraktu. Nic nie rób.
2. **Skasuj** - tylko gdy `ślady=brak`. Okno „Osoby" -> „Usuń" (`DELETE /person/:id`). Baza kasuje
   razem pusty wiersz konta. Kasowanie osoby dotyka wyłącznie bazy - nie Dysku Google.
3. **Odłóż do anonimizacji** (`ROD-6`) - gdy ślady są niepuste. Dziś „Usuń" takiej osoby albo odmówi
   („rekord jest w użyciu" - np. oferty, zabezpieczenia, typy spraw, wizyty na budowie), albo
   **skasuje ślady kaskadą** (zadania, nieobecności, wpisy planowania) - nie rób tego. Po `ROD-6`
   osoba z historią jest anonimizowana, a historia zostaje.

Kasuj pojedynczo, z okna. Nie kasuj skryptem ani SQL-em - to nie jest operacja hurtowa.

## Krok 3 - udokumentuj i sprawdź

1. Zachowaj wynik trybu domyślnego (same numery) z datą i liczbą decyzji (zostawione / skasowane /
   odłożone) w dokumentacji RODO firmy - poza tym repozytorium.
2. Uruchom raport ponownie: liczba osób bez powiązań ma spaść dokładnie o liczbę skasowanych.

## Czego nie robić

- Nie kasuj osób ze śladami i nie kasuj hurtowo.
- Nie wklejaj wyjścia `--review` nikomu i nigdzie; nie zapisuj go na dyskach współdzielonych.
- Nie zmieniaj definicji „bez powiązań" w skrypcie bez sprostowania w planie RODO (pack ROD) - liczba
  ma zgadzać się z pomiarem odniesienia.

## Powiązane

- Skrypt: `src/scripts/persons-unlinked-report.ts`; zapytania: `src/persons/unlinkedPersons/`,
  `src/persons/personReferences/` (inwentarz odwołań - do użycia także przy odmowie kasowania w `ROD-6`).
- Raport rozjazdów kont (`ROD-5`): `yarn persons:legacy-report`.
- Plan i decyzje: pack ROD w vaulcie SB (PS.APP.01), decyzja `D-ROD-4`.
