# Osobne wdrozenie poprawki modelu analizy pism i ofert

Stan przygotowania: 2026-11-04. Baza: `origin/main`, commit
`41fe84311bc1fea021f55c747031d9df374f0f6e`, po `git fetch origin main`.
Galaz lokalna: `codex/ps-ai-model-20261104`.

## Granice wydania

Poprawka powstala w osobnym worktree, poniewaz glowny checkout zawiera zmiany
oczekujace na testy. Nie wydawac z glownego checkoutu i nie wykonywac tam
`git add .`, stasha, resetu ani czyszczenia. Pakiet poprawki zawiera tylko:

- `src/tools/ToolsAI.ts`
- `src/tools/__tests__/ToolsAI.analyzeDocument.test.ts`
- `documentation/team/runbooks/ai-document-model-hotfix.md`
- `documentation/team/operations/post-change-checklist.md` (wylacznie nowy wpis tej poprawki)

Wybrano `gpt-6-luna`: wedlug dokumentacji sprawdzonej 2026-11-04 jest aktywnym,
ekonomicznym modelem do ekstrakcji. Cena Standard: 0,10 USD wejscie i 0,50 USD
wyjscie za milion tokenow. GPT-4o mini jest tanszy od pelnego GPT-4o, ale juz
deprecated; ogloszony termin wylaczenia to 2027-01-14. Nie wybrano przejsciowego
modelu z ogloszonym wycofaniem. Inne zastosowania AI w PS pozostaja poza wydaniem.

Zrodla decyzji:

- https://developers.openai.com/api/docs/models/gpt-6-luna
- https://developers.openai.com/api/docs/pricing
- https://developers.openai.com/api/docs/deprecations
- https://developers.openai.com/api/docs/guides/latest-model

## Kontrola przed wdrozeniem

1. Porownac aktualny commit wdrozony na serwerze z baza poprawki. `origin/main`
   jest potwierdzona baza Git, ale nie jest dowodem wersji dzialajacej produkcji.
   Jesli sa rozne, ustalic przyczyne przed wydaniem.
2. Sprawdzic na docelowym srodowisku wylacznie wartosc `OPENAI_MODEL`, bez
   wypisywania pozostalych zmiennych ani sekretow. Zmienna ma pierwszenstwo przed
   domyslnym modelem. Jezeli wskazuje stary model, samo wdrozenie kodu nie wystarczy.
   Nie przestawiac jej globalnie bez sprawdzenia wplywu na CV i paragony.
   Przedstawic wlascicielowi konkretna zmiane konfiguracji do zatwierdzenia.
3. Potwierdzic dostep projektu OpenAI do `gpt-6-luna`. W tej sesji nie czytano
   kluczy ani konfiguracji produkcyjnej i nie wywolywano platnego API.
4. Przeprowadzic probe z syntetycznym PDF/DOCX na osobnej instancji testowej,
   przez oba formularze: pisma oraz oferty. Sprawdzic numer, date, temat,
   nadawce, brakujace pola oraz metadane modelu/zuzycia w odpowiedzi analizy.
   Sama analiza nie wymaga zapisywania pisma. Lokalny test z atrapa API nie
   dowodzi jakosci ekstrakcji ani dostepnosci rzeczywistego modelu.

## Walidacja i wydanie

W odizolowanym worktree:

```powershell
$env:NODE_ENV = 'test'
yarn test --runInBand --runTestsByPath src/tools/__tests__/ToolsAI.analyzeDocument.test.ts
$env:NODE_OPTIONS = '--max-old-space-size=8192'
yarn build
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
```

Sprawdzic dokladnie cztery powyzsze pliki i zakres wpisu w checklist.
Nie wykonywano commitu, pusha ani wdrozenia. Commit i wydanie wymagaja osobnego
polecenia wlasciciela na przejrzany zakres. Przy wlaczonej automatyzacji push na
`main` moze od razu wdrozyc produkcje; przed pushem potwierdzic aktualna trase
wydania. Nie laczyc calej roboczej galezi z oczekujacymi zmianami.

Jesli baza zdazy sie zmienic, utworzyc osobny czysty worktree z uzgodnionej bazy,
sprawdzic `git apply --check <sciezka-do-ai-document-model.patch>`, potem
`git apply --index <sciezka-do-ai-document-model.patch>` i powtorzyc walidacje.
Konflikt oznacza reczny przeglad; nie wymuszac nadpisania plikow.
Instalacja zaleznosci, jesli potrzebna: `yarn install --frozen-lockfile`.
Lokalnie uzyto istniejacych zaleznosci przez junction; nie zmieniano lockfile.

Po wydaniu sprawdzic analize w obu formularzach, zanim zapisze sie dokument.
Standardowy release serwera ma bramke `yarn node build/scripts/migrate.js verify`;
ta poprawka nie dodaje migracji i nie wymaga uruchamiania `migrate apply`.
Wycofanie: osobna odwrotna poprawka kodu albo powrot do poprzedniego wydania,
z zachowaniem pozostalych zmian. Powrot do starego modelu odtworzy pierwotny blad,
wiec w razie problemu czasowo zrezygnowac z analizy AI i uzupelnic pola recznie.
