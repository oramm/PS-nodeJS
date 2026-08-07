# Migracja Google Drive na dysk współdzielony Workspace

## Cel

Przeniesienie całej struktury plików z konta prywatnego `oramwp@gmail.com` na dysk
współdzielony Google Workspace tak, aby:

- wszystkie obiekty miały jednego właściciela (organizację),
- baza danych dalej wskazywała na właściwe pliki,
- nic nie zostało utracone.

Skala: **92 projekty, 386 680 obiektów, 603 GB**.

## Zasada nadrzędna

Migracja idzie **projekt po projekcie**, nigdy całym drzewem naraz. Wymuszają to dwie
rzeczy: quota mastera (patrz niżej) i możliwość zatrzymania się po pierwszym projekcie,
który pójdzie źle.

---

## 1. Warunki wstępne (sprawdzić PRZED czymkolwiek)

### 1.1. Przeciągnięcie przez konto spoza domeny — ZWERYFIKOWANE

Master (`oramwp@gmail.com`) jest kontem spoza Workspace i **to nie jest przeszkodą**.
Sprawdzone empirycznie: **kiedy master jest właścicielem całego drzewa, przeciągnięcie
na dysk współdzielony przechodzi bez problemu.**

Wcześniejsze niepowodzenie (*„Twoja domena nie zezwala edytującym na przenoszenie plików
na dyski współdzielone"*, wyszarzona opcja u właściciela domeny) brało się z czego
innego: master był wtedy **edytorem** cudzych obiektów, a nie ich właścicielem.
Google blokuje przenoszenie do dysku współdzielonego edytorom, nie właścicielom —
przynależność do domeny nie ma tu znaczenia.

**Wniosek dla całej migracji:** jedynym warunkiem powodzenia przeciągnięcia jest
jednolita własność mastera w całym poddrzewie. Dokładnie to sprawdza `--verify-takeover`
(rozdział 3, krok 3). Zielona weryfikacja = przeciągnięcie się uda.

### 1.2. Dysk docelowy

Nowy dysk współdzielony, **osobny od archiwum** (`0AC9reRak_hVOUk9PVA` trzyma kopię
zapasową). Wszystkie 16 kont z tokenami dodane jako **Menedżerowie**.

Dysk docelowy pomieści 386 414 elementów przy limicie 500 000 — **77% zapełnienia**.
Archiwum oryginałów musi zostać na innym dysku, inaczej limit pęknie.

### 1.3. Przestrzeń dyskowa

| Gdzie | Ile trzeba | Uwaga |
|---|---:|---|
| Quota mastera (`oramwp@gmail.com`) | **137 GB** | tyle waży największy projekt (SCI); przeciągnięcie zwalnia miejsce, dlatego projekt po projekcie |
| Pula Workspace | **~1,21 TB** | 603 GB kopii zapasowej + 603 GB dysku docelowego |

**Archiwum oryginałów: `1Hbrs7uOt1p4pQMgq0rqfWVZF0Nd34MWb`** (`ARCHIWUM-migracji-GD`)
— folder w „Mój dysk" konta `oramwp@gmail.com`, **nie** na dysku współdzielonym.
To celowe: przeniesienie cudzego pliku do Mojego Dysku mastera **nie zmienia jego
właściciela**, więc nie wymaga transferu własności na organizację i nie obciąża puli
Workspace. Gdyby archiwum było dyskiem współdzielonym, każda archiwizacja cudzego pliku
byłaby ukrytą zmianą właściciela — i najpewniej kończyłaby się błędem.

Dostęp: właściciel `oramwp@gmail.com` + edycja dla `kotalamichal02@gmail.com`.
Bez linku publicznego — uprawnienia folderu dziedziczą się na wszystko, co do niego
trafi, a archiwum zawiera oryginały prawdziwych dokumentów projektowych.

Business Starter (30 GB/użytkownika) tego nie udźwignie. Business Standard (2 TB) tak,
ale bez zapasu.

### 1.4. Tokeny

Komplet 16 kont (15 w `tokens.json` + master z `REFRESH_TOKEN` w `.env`).
**Wszystkie 87 folderów-blokerów jest pokrytych** — należą do 5 osób, które mają tokeny.

---

## 2. Co dzieje się z plikami

Skrypt przechodzi drzewo i dla każdego obiektu wybiera jedną z trzech ścieżek:

| Sytuacja | Co się dzieje | ID | Ile tego jest |
|---|---|---|---:|
| Właścicielem jest już master | nic | **bez zmian** | 6 071 plików (2%) |
| Właściciel ma token | **transfer własności** — plik nie drga, zmienia się tylko wpis właściciela | **bez zmian** | 219 530 plików (71%) |
| Właściciel bez tokenu | **kopia** do drzewa + oryginał do archiwum | **NOWE** | 82 681 plików (27%) |

Foldery działają analogicznie: cudzy folder bez tokenu dostaje **folder zastępczy**
(nowe ID), a oryginał trafia do archiwum wraz z tym, czego nie dało się przenieść.

### Dlaczego to ma znaczenie dla bazy

**Tylko trzecia kategoria zmienia ID.** Transfer własności zachowuje ID i całą historię
wersji — z punktu widzenia bazy danych nic się nie dzieje. Dlatego reindeksacja dotyczy
wyłącznie kopii i folderów zastępczych.

Każda zmiana ID trafia do `gd-takeover-map.jsonl` w formacie `{"old": "...", "new": "..."}`,
dopisywanym **na bieżąco** (nie na końcu), więc przerwanie procesu nie gubi wiedzy o tym,
co już zostało zrobione.

### Zgoda przy zmianie właściciela (pułapka)

Zmiana właściciela między kontami konsumenckimi to transakcja dwustronna: właściciel
**oferuje**, odbiorca **przyjmuje**. Google nie pozwala zrobić tego jednostronnie, bo
własność obciąża limit miejsca odbiorcy.

Pułapka: **utworzenie uprawnienia, które od razu niesie `pendingOwner`, jest odrzucane**
(`consentRequiredForOwnershipTransfer`), gdy powiadomienie mailowe jest wyłączone —
mail jest wtedy jedynym śladem zgody odbiorcy. Za to **podniesienie do `pendingOwner`
uprawnienia już istniejącego przechodzi bez maila**.

Dlatego transfer idzie trzema krokami:

1. jeśli master nie ma wpisu uprawnienia → nadaj zwykłe `writer` (bez `pendingOwner`),
2. podnieś to uprawnienie do `pendingOwner`,
3. master przyjmuje własność (`transferOwnership: true`).

Uwaga, która to spowodowała: master często ma dostęp do pliku przez **własność folderu
nadrzędnego**, a to **nie tworzy wpisu uprawnienia na pliku**. W interfejsie Google
wygląda to jak „udostępnione jako edytujący", ale `permissions.list` nie zwraca dla
mastera nic, co dałoby się podnieść — stąd konieczność kroku 1.

Objawia się to rzadko (1 plik na ~4 550 transferów w próbie), bo aplikacja nadaje
`anyone/writer` wszystkiemu, co tworzy. Dotyczy plików wrzucanych **ręcznie przez
ludzi**, z pominięciem aplikacji, udostępnianych imiennie.

### Kolejność operacji przy folderze bez tokenu

1. utworzenie folderu zastępczego,
2. zapis pary `old → new` do mapy,
3. archiwizacja oryginału.

Ta kolejność jest celowa. Awaria między krokami zostawia oryginał w drzewie, a mapa zna
już zastępnik — wznowienie samo domyka archiwizację. Okno, w którym w jednym miejscu są
dwa foldery o tej samej nazwie, trwa dwa wywołania API zamiast czasu przetwarzania
całego poddrzewa.

**Oryginał nigdy nie jest kasowany** — tylko przenoszony. Do tego istnieje pełna,
zweryfikowana kopia zapasowa wszystkich 92 projektów.

### Przeciągnięcie na dysk współdzielony

**Przeciągnięcie MUSI iść przez interfejs Google, nie przez API.** Sprawdzone
empirycznie:

| Sposób | ID folderów | ID plików |
|---|---|---|
| **UI (przeciągnięcie)** | **zachowane** | **zachowane** |
| API | **zmienione** | zachowane |

Powód: API nie potrafi przenieść folderu na dysk współdzielony
(`teamDrivesFolderMoveInNotSupported`), więc każda próba kończy się utworzeniem nowego
folderu — z nowym ID. Interfejs Google wykonuje prawdziwe przeniesienie i zachowuje
wszystko.

Praktyczny wniosek: **po przeciągnięciu przez UI nie ma żadnej dodatkowej
reindeksacji.** Wszystkie zmiany ID powstają wyłącznie na etapie przejęcia własności.
Nie próbować skryptować tego kroku — to jedyny fragment migracji wykonywany ręcznie
i musi taki zostać.

---

## 3. Cykl migracyjny jednego projektu

Powtarzany 92 razy, od najmniejszych do największych.

### Krok 1 — dry-run przejęcia

```bash
yarn gd:move-test --takeover <FOLDER_ID> --tokens tokens.json --master-email oramwp@gmail.com --concurrency 20
```

Pokazuje, ile będzie transferów, ile kopii, ile folderów zastępczych. **Nie zmienia niczego.**
Warunek przejścia dalej: `❌ Bledy: 0`.

### Krok 2 — przejęcie własności

```bash
yarn gd:move-test --takeover <FOLDER_ID> --tokens tokens.json --master-email oramwp@gmail.com --concurrency 20 --archive <ARCHIWUM_FOLDER_ID> --apply
```

Automatycznie zapisuje `gd-takeover-before-<ID>.jsonl` — zdjęcie drzewa sprzed zmian.

Na co patrzeć w podsumowaniu:

- **`⛔ Oryginaly ZOSTALY w drzewie` > 0** — archiwizacja cudzych plików na dysk
  współdzielony nie przechodzi. Przełączyć się z `--archive` na `--unlink-originals`
  (oryginały zostają u właścicieli, my mamy kopię zapasową).
- **`❌ Bledy` > 0** — szczegóły w `gd-takeover-failures.txt`.
- **`Ponowienia API`** wysokie — obniżyć `--concurrency`.

### Krok 3 — weryfikacja

```bash
yarn gd:move-test --verify-takeover <FOLDER_ID> --tokens tokens.json --master-email oramwp@gmail.com
```

Sprawdza dwie rzeczy:

1. **jednolita własność** — każdy obiekt należy do mastera,
2. **kompletność** — każdy obiekt ze zdjęcia sprzed zmian jest rozliczony: to samo ID,
   następnik z mapy albo archiwum.

Punkt 1 to **dokładnie ten warunek, od którego zależy przeciągnięcie** (patrz 1.1) —
pojedynczy cudzy obiekt w poddrzewie wystarczy, żeby Google odmówiło. Dopóki weryfikacja
nie wyjdzie czysto, **nie przeciągać**.

### Krok 4 — reindeksacja bazy

Najpierw dry-run na **kopii lokalnej**, potem produkcja (szczegóły w rozdziale 4).

### Krok 5 — przeciągnięcie w UI

Przeciągnąć folder projektu na dysk docelowy. Mechanizm jest sprawdzony (patrz 1.1) —
przy jednolitej własności mastera przechodzi bez oporu. To zadanie po stronie Google,
wykonywane w tle.

**Zmierzyć czas pierwszego projektu** — to jedyny etap, którego nie da się oszacować
z góry; skaluje się liczbą elementów, nie gigabajtami.

### Krok 6 — sprawdzenie w aplikacji

Otworzyć kilka spraw z tego projektu w ENVI.ProjectSite: czy linki do GD działają, czy
dodanie nowego pliku trafia we właściwe miejsce.

---

## 4. Reindeksacja — jak działa

### Co robi

Podmienia w bazie stare ID na nowe według mapy z przejęcia. Dotyczy **wyłącznie** kopii
i folderów zastępczych — obiekty przejęte transferem zachowały ID i nie ma ich w mapie.

### Jak znajduje kolumny

Nie ma listy zaszytej w kodzie. Skrypt pyta `information_schema` o wszystkie kolumny
tekstowe pasujące do wzorca `Gd.*Id$` w bieżącej bazie — **znalezionych 26 kolumn**.
Dzięki temu nowe tabele z linkami do GD są obsługiwane automatycznie.

### Zabezpieczenia

| Mechanizm | Działanie |
|---|---|
| **Blokada hosta** | odmawia pracy na bazie innej niż localhost, dopóki nie podasz `--allow-remote` |
| **Dry-run domyślnie** | bez `--apply` tylko liczy trafienia |
| **Jedna transakcja** | wszystkie `UPDATE` razem — albo wszystko, albo nic |
| **Weryfikacja po wykonaniu** | liczy, ile starych ID zostało (oczekiwane 0) |
| **Idempotencja** | ponowne uruchomienie daje 0 trafień, nie psuje danych |
| **Dziennik** | `gd-reindex-log-apply.json` — dowód wykonania i podstawa do cofnięcia |

### Który plik mapy

- **`gd-takeover-map.jsonl`** — dopisywany na bieżąco. **Użyj tego, jeśli przejęcie
  zostało przerwane.**
- `gd-takeover-map.json` — skonsolidowany, zapisywany dopiero na końcu udanego przebiegu.

### Kolejność

```bash
# 1. dry-run na kopii lokalnej — ile trafień?
yarn gd:reindex --map gd-takeover-map.jsonl

# 2. wykonanie na kopii lokalnej
yarn gd:reindex --map gd-takeover-map.jsonl --apply

# 3. sprawdzić aplikację lokalnie, w razie potrzeby cofnąć
yarn gd:reindex --map gd-takeover-map.jsonl --rollback --apply

# 4. dopiero teraz produkcja — NAJPIERW dry-run
yarn gd:reindex --map gd-takeover-map.jsonl --allow-remote

# 5. produkcja
yarn gd:reindex --map gd-takeover-map.jsonl --allow-remote --apply
```

Krok 4 jest obowiązkowy: liczba trafień na produkcji musi być zbliżona do tej z kopii.
Duża rozbieżność oznacza, że kopia bazy jest nieaktualna.

**Zawsze sprawdzić nagłówek `[reindex] Baza: host/nazwa`** przed `--apply`.

### Cofnięcie

```bash
yarn gd:reindex --map gd-takeover-map.jsonl --rollback --apply --allow-remote
```

Mapa odwrotna `new → old`. Działa dopóki stare obiekty istnieją — a istnieją, bo
oryginały są archiwizowane, nie kasowane.

### Okno niespójności

Między przejęciem a reindeksacją baza wskazuje na zarchiwizowane oryginały. Pliki dalej
się otworzą, ale zapis trafi do archiwum. **Reindeksację robić bezpośrednio po
weryfikacji przejęcia**, najlepiej poza godzinami pracy.

---

## 5. Awarie i wznawianie

### Przerwanie przejęcia

Ponowne uruchomienie tej samej komendy jest bezpieczne:

- **transfery** są z natury idempotentne — po transferze obiekt należy do mastera, więc
  kolejny przebieg klasyfikuje go jako „już własny",
- **przerwany transfer** zostawia tylko oczekujące zaproszenie; plik nadal należy do
  właściciela, nic się nie psuje, wznowienie domyka drugi krok,
- **kopie i foldery zastępcze** są odczytywane z mapy i pomijane,
- obiekt utworzony tuż przed awarią, jeszcze nieodnotowany w mapie, jest **odnajdywany
  po nazwie** (odróżniany od oryginału po właścicielu) zamiast kopiowany po raz drugi.

### Czy plik może się uszkodzić

**Nie.** `files.copy`, zmiana właściciela i przeniesienie to operacje atomowe po stronie
Google. Bajty nie przechodzą przez nasz komputer — kopia albo powstaje w całości, albo
wcale. Ryzyko przy przerwaniu jest **strukturalne** (duplikat, brakująca gałąź), nigdy
nie dotyczy integralności treści. Weryfikacja z kroku 3 wykrywa oba przypadki.

### Ostatnia linia obrony

Pełna kopia zapasowa: 92/92 projekty, 386 680 obiektów, 603 GB, każdy projekt
zweryfikowany jako kompletny. Manifesty `gd-out/bak-*.jsonl` zawierają pary
`src → dst` dla każdego obiektu.

---

## 6. Kolejność projektów

1. **Próba generalna: `RAD.GWS.02.POIS`** (`1S-DlhgXGbQ3188kC0yH_gPTpXGCm3MHA`) —
   1 929 elementów, 1,5 GB, **52 blokery**. Mały, ale zawiera blokery, więc testuje
   jednocześnie transfer własności i przeciągnięcie. Przejść **pełny cykl 1–6**.
2. Pozostałe projekty rosnąco (mediana to 413 elementów — większość pójdzie w minuty).
3. Na końcu osiem największych, w tym `SCI.GWS.01.POIS` (76 172 elementy, 137 GB) —
   samo przejęcie ok. 1,5–2 h.

Szacunek całości przejęcia: **7–9 h pracy skryptu** przy `--concurrency 20`.
Przeciągnięcia: **1–3 dni przetwarzania w tle** po stronie Google.

---

## 7. Znane kwestie otwarte

- ~~`sendNotificationEmail: false` niezweryfikowany~~ — **POTWIERDZONE 2026-08-06**:
  transfer własności przechodzi bez powiadomień, ale wymagało to poprawki
  (patrz niżej: „Zgoda przy zmianie właściciela").
- ~~`--apply` nigdy nie uruchomione~~ — **POTWIERDZONE 2026-08-06** na `tes.d.c.l`:
  428 obiektów, 1 transfer + 2 kopie + 3 foldery zastępcze, 4 oryginały do archiwum,
  0 błędów, 0 ponowień. Weryfikacja: 428/428 u mastera, 0 nierozliczonych.
- **2 pliki są niekopiowalne przez Google** (My Maps, Gantter) — nie mają
  `capabilities.canCopy`. Jeśli należą do kont bez tokenu, trzeba je przenieść ręcznie.
- **471 martwych ID w bazie** — wskazują na obiekty, których już nie ma. Do
  wyczyszczenia niezależnie od migracji.
- Zmiany w `ToolsGd.ts` (`supportsAllDrives`) są na produkcji, ale **nie przeszły
  przeglądu kodu**.

---

## Powiązane

- `src/scripts/gd-move-test.ts` — przejęcie, weryfikacja, transfer, tokeny
- `src/scripts/gd-backup.ts` — kopia zapasowa i jej weryfikacja
- `src/scripts/gd-reindex.ts` — reindeksacja bazy
- `documentation/team/operations/post-change-checklist.md` — wpis po zmianie
