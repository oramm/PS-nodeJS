# Pomoc ENVI w PS — wdrożenie

Pomoc korzysta z paczek ENVI Agenta przypiętych w `envi-agent.version`. Instrukcja dotyczy obu repozytoriów gałęzi `pomoc/ps`. Nie wymaga zmiany Reacta ani nowych zależności.

## Kolejność uruchomienia

1. Najpierw scal ekran do `master` i opublikuj go przez GitHub Pages w repo `pomoc-site`. Budowa serwera pobiera właśnie `master`, więc ekran musi być scalony przed jej rozpoczęciem.
2. Następnie wykonaj migrację na produkcji: potwierdź docelową bazę i `NODE_ENV`, przejrzyj `yarn migrate:list` zgodnie z [procedurą migracji](db-migration-execution.md). Nowy SQL: `src/pomoc/migrations/001_create_pomoc_api_usage.sql`. Po wykonaniu na zatwierdzonym celu sprawdź strukturę `PomocApiUsage`, indeksy i wpis/checksum w `SchemaMigrations`. `yarn migrate:apply` wykonuje wszystkie oczekujące migracje, więc wymaga przeglądu całej listy; `_down.sql` jest pomijany. `yarn migrate:verify` musi przejść przed release — istniejący Procfile już ma tę bramkę.
3. Potem wdróż serwer. Przycisk pojawi się dopiero po odpowiedzi `available=true`; stara wersja serwera/błąd sieci nie pokazuje przycisku. GitHub Pages/build ekranu pozostają poza Heroku serwera.
4. Zanim wpiszesz kogokolwiek do `POMOC_USERS` lub włączysz `POMOC_ROLES`, potwierdź na Heroku dokładnie jeden proces web (jedno dyno i jeden proces aplikacji). Dopiero wtedy ustaw `POMOC_ANTHROPIC_API_KEY`, `POMOC_CANON_TOKEN` (tylko odczyt kanonu) i `POMOC_USERS` (CSV e-maili). Opcjonalne `POMOC_ROLES=ENVI_MANAGER,ENVI_EMPLOYEE` dopuszcza wszystkich pracowników ENVI przez CSV dokładnych nazw ról zamiast wpisu e-maila w `POMOC_USERS`, a brak tej zmiennej zachowuje dotychczasowe zasady. Wartości nie trafiają do repo ani przeglądarki. Brak klucza/tokena lub obu list wyłącza Pomoc i nie zatrzymuje serwera. Kanon musi dopuszczać Pomoc i zawierać cennik modelu używanego we wzorcu AQM.
5. Sprawdź osobistą sesję dozwolonego konta, konto spoza listy, agentów oraz rolę ograniczoną do projektów. Zadaj co najmniej dwa kolejne pytania; potwierdź odpowiedzi z wersjami serwera i ekranu oraz osobny wpis kosztu każdego pytania. Testy automatyczne używają atrapy modelu i bazy. W tym zadaniu nie wykonywano migracji ani wdrożenia.

## Kopia kodu i wersja

`yarn build` serwera tworzy `.pomoc-src`, a następnie uruchamia `tsc`. Lokalnie kopiuje dozwolony kod `src` serwera i `../pomoc-site/src`; inny katalog można podać jako `POMOC_SITE_DIR` albo argument `yarn node scripts/pomoc-snapshot.mjs <katalog-ekranu>`. Bez lokalnego ekranu nie korzysta z sieci i ostrzega o kopii zawierającej tylko serwer.

Na Heroku brak lokalnego ekranu uruchamia pobranie publicznego archiwum `https://codeload.github.com/oramm/ENVI.ProjectSite/tar.gz/master`. Niepowodzenie pobrania/kopiowania ekranu nie przerywa budowy serwera. Build wymaga dostępnego `tar`. Archiwum i katalog tymczasowy są sprzątane, a istniejąca kopia zastępowana po przygotowaniu nowej. Lista dozwolonych pomija pliki środowiska, dane/testy, skrypty operacyjne, poświadczenia, dowiązania i pliki binarne. Komentarze są usuwane, rozpoznawane sekrety i dane osobowe maskowane przed zapisem.

Wersja serwera pochodzi kolejno z `HEROKU_SLUG_COMMIT`, `SOURCE_VERSION` albo `git rev-parse HEAD` przy budowie lokalnej. `build-info.json` zapisuje też wersję ekranu: lokalny SHA lub SHA z nagłówka PAX pobranego tarballa `master`; gdy SHA jest nieosiągalne, zapisuje „master z <data budowy>”. Etykieta odpowiedzi pokazuje oba SHA skrócone do siedmiu znaków, np. „Na podstawie PS ENVI serwer abc1234, ekran def5678”. Serwer porównuje pełny SHA serwera z wersją zadeklarowaną przez Heroku; rozbieżność wyłącza Pomoc. Zmiana samego ekranu nie odświeża kopii na serwerze — potrzebna jest ponowna budowa serwera.

## Czas, zakres i wycofanie

Pytanie zwraca HTTP 202 z identyfikatorem istniejącego mechanizmu `TaskStore`. Ekran odbiera wynik przez `GET /sessionTaskStatus/:taskId`; wynik Pomocy wymaga osobistej sesji autora i aktualnej obecności na liście dostępu. Pozostałe zadania działają jak dotąd. W ten sposób czas odpowiedzi modelu nie utrzymuje żądania HTTP na Heroku. Timeout pojedynczego wywołania modelu wynosi 60 s, wspólny deadline żądań do modelu 240 s, retencja zadania 5 min. Rozmowa ekranu jest tylko w pamięci i znika po wylogowaniu/przeładowaniu; licznik przechowuje koszt i tokeny, bez treści rozmowy.

Jak we wzorcu AQM, blokada budżetu działa w jednym procesie. `TaskStore` również jest lokalny dla procesu. Włączenie na wielu dyno/procesach wymaga wspólnego magazynu zadań i blokady budżetu; obecny moduł uruchamiaj na jednym procesie web.

Wycofanie: usuń obie listy (`POMOC_USERS` i `POMOC_ROLES`) albo klucz API i wdróż poprzedni kod. Zachowaj tabelę kosztów. `_down.sql` usuwa historię i jest wyłącznie jawną operacją administratora. Nie zmieniono działania pozostałych tras ani źródeł w cudzych kopiach roboczych.

## Weryfikacja i lista PR

- [x] DB/env/deploy opisane w `post-change-checklist.md`.
- [x] Nazwy nowych zmiennych bez wartości dodane do `.env.example`.
- [x] Heroku: konfiguracja, wersja, snapshot i kolejność wdrożenia opisane powyżej.
- [x] Akcje lokalne i pliki SQL wskazane; migracje rzeczywistej bazy pozostawione operatorowi.
- [x] Bramka migracji bez zmian; `migrate:verify` nie uruchamiano, bo wymaga rzeczywistej bazy.
- [x] Frontend wymagany w `pomoc-site`; odpowiedzialność za GitHub Pages pozostaje w tym repo.
- [x] Testy atrapy i render React 18 dodane do istniejących runnerów; liczby przed/po w raporcie przekazania.

Szablon `.github/PULL_REQUEST_TEMPLATE.md` pozostaje ogólnym szablonem dla kolejnych PR. Powyżej wypełniono jego listę dla tej zmiany. Commit, push, wydanie i ustawienie sekretów wykonuje dyspozytor.

## Pliki do przekazania dyspozytorowi

### pomoc-server

- `.env.example`
- `.gitignore`
- `documentation/team/operations/post-change-checklist.md`
- `documentation/team/runbooks/pomoc-envi.md`
- `package.json`
- `scripts/fetch-envi-agent.mjs`
- `scripts/pomoc-snapshot.mjs`
- `scripts/pomoc-snapshot.test.mjs`
- `src/index.ts`
- `src/pomoc/PomocRouters.ts`
- `src/pomoc/__tests__/pomoc.test.ts`
- `src/pomoc/__tests__/snapshot.test.ts`
- `src/pomoc/agent-server-types.ts`
- `src/pomoc/body.ts`
- `src/pomoc/data-tools.ts`
- `src/pomoc/input.ts`
- `src/pomoc/migrations/001_create_pomoc_api_usage.sql`
- `src/pomoc/migrations/001_create_pomoc_api_usage_down.sql`
- `src/pomoc/service.ts`
- `src/pomoc/store.ts`
- `src/setup/Sessions/Gauth2Routers.ts`
- `src/setup/Sessions/projectScopedPolicy.ts`
- `src/types/sessionTypes.ts`

### pomoc-site

- `scripts/fetch-envi-agent.mjs`
- `src/Contracts/ContractsList/Modals/ContractModalButtons.tsx`
- `src/Letters/LettersList/Modals/LetterModalButtons.tsx`
- `src/Pomoc/Pomoc.css`
- `src/Pomoc/Pomoc.test.tsx`
- `src/Pomoc/Pomoc.tsx`
- `src/Pomoc/pomoc-markers.ts`
- `src/React/MainWindow/MainMenu.tsx`
- `src/TasksGlobal/Modals/Case/CaseModalButtons.tsx`
- `src/View/Modals/GeneralModalButtons.tsx`
- `src/View/Modals/ModalsTypes.ts`

## Wyniki weryfikacji 2026-11-11 — etap A

| Kontrola | Przed | Po |
|---|---|---|
| Serwer `tsc` / `yarn build` | 0 błędów | 0 błędów, kopia lokalnego ekranu utworzona |
| Serwer Jest | 2976 zal., 1 błąd, 5 pominiętych | 3000 zal., 0 błędów, 5 pominiętych |
| Ekran `tsc --noEmit` | 0 błędów | 0 błędów |
| Ekran Vitest | 918 zal., 0 błędów | 926 zal., 0 błędów |
| Ekran webpack do `tmp/pomoc-webpack` | nie uruchamiano | kompilacja zakończona powodzeniem |

23 nowe testy serwera obejmują dostęp, agentów, prywatność wyników zadań, limit 256 kB, walidację i historię, odpowiedź modelu z zapisem kosztu, błędy licznika/kanonu, zakres projektów, serializację oraz filtrowanie i lokalny ekran w kopii kodu. 8 nowych testów ekranu obejmuje także render i formularz rzeczywistego panelu na React 18, dostępność, F1/Escape, znaczniki i szkic zgłoszenia. Dist paczki używa standardowego JSX i `useEffect`, bez API wyłącznie React 19; deklaracja peer React 19 pozostaje bez zmian.

W pierwszym pełnym Jest zastany test certyfikatów przekroczył 5 s; oba pełne przebiegi po zmianach przeszły bez tego błędu. Jeden pośredni przebieg Vitest miał niepowodzenie zastanego testu instalatora SB (kolejność asynchronicznych wywołań mocka fetch); powtórzenie tego pliku i końcowy pełny przebieg przeszły. Nie zmieniano tych testów ani ich kodu produkcyjnego. Pierwszy przebieg Vitest z domyślną liczbą procesów przerwano z powodu obciążenia; pełne porównanie wykonano z `--maxWorkers=2`.

`git diff --check` przechodzi w obu repozytoriach. Nowy kod przejrzano także bezpośrednio w diffie; odczyt profilu z lokalnymi `SKILL.md` był blokowany przez piaskownicę. Nie wykonano prawdziwego API/modelu, pobrania tarballa na Heroku, migracji na rzeczywistej DB ani testu przeglądarki na produkcji. Decyzje operatora: konta pilotażowe i sekrety, zatwierdzony cel migracji, pojedynczy proces web oraz termin wspólnego wdrożenia serwera/ekranu.

Surowe logi porównania: `pomoc-server/tmp/dev-runtime/pomoc-validation/` oraz `pomoc-site/tmp/pomoc-validation/` (artefakty lokalne, ignorowane przez git).

Poprawki po etapie A: pełny Jest 3000 → 3003 zaliczonych (5 pominiętych), pełny Vitest 926 → 928, `tsc --noEmit` przed/po bez błędów w obu repo. Pomoc: serwer 23 → 26, ekran 8 → 10; wewnętrzne testy snapshotu 1 → 3. Sprawdzono również rzeczywisty publiczny tarball `master` i lokalny manifest obu SHA. Logi poprawek znajdują się w podkatalogach `fixes-20261111/` powyższych lokalizacji. Przegląd diffu bez ustaleń blokujących. Bez prawdziwego modelu, DB, przeglądarki ani wdrożenia Heroku.
