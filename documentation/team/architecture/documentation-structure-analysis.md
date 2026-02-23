# Analiza struktury dokumentacji PS-nodeJS

> Data analizy: 2026-02-22
> Cel: Identyfikacja problemow w organizacji dokumentacji - bez propozycji zmian.
> Referencje: `documentation/team/operations/docs-map.md`, `documentation/ai/README.md`, `documentation/team/README.md`

---

## Stan obecny: Gdzie co lezy

| Lokalizacja | Zawartosc | Warstwa wg DOCS-MAP |
|---|---|---|
| `.github/instructions/` (7 plikow) | Reguly architektoniczne, drzewa decyzyjne AI, testowanie, audit refactoringu | A |
| `.github/copilot-instructions.md` | Instrukcje dla Copilota VS Code | A |
| `CLAUDE.md` | Podsumowanie wszystkiego + instrukcje Claude | A + C |
| `factory/prompts/` (4 pliki) | Prompty agentow (reviewer, planner, tester, documentarian) | A |
| `factory/` (reszta, 13 plikow) | Audyty kodu, mapa systemu, adaptery narzedzi, koncepcja fabryki | A + mieszanka |
| `documentation/team/onboarding/` (3 pliki) | Setup, environment, secrets | C |
| `documentation/team/runbooks/` (5 plikow) | Procedury powtarzalne (testy, login, migracje) | C |
| `documentation/team/operations/` (4 pliki luzne + 6 katalogow feature) | DB changes, deployment, post-change checklist, documentation-migration-plan + plany/postepy feature'ow | B + C |
| `documentation/team/architecture/` (1 plik) | System context diagram | V |
| `documentation/ai/` (1 plik) | Model canonical + adapters: definiuje ze `documentation/team/*` to canonical, a `.github/instructions/` i `AGENTS.md` to adaptery narzedziowe | meta-polityka |

---

## Nadrzedna polityka repo (punkt odniesienia)

Zanim oceniamy warstwy A-V z DOCS-MAP, trzeba pamietac o nadrzednej zasadzie:

> **Canonical operational docs = `documentation/team/*`** (zrodlo: `documentation/ai/README.md`, `documentation/team/README.md`)

Pliki poza `documentation/team/` (tj. `.github/instructions/`, `CLAUDE.md`, `factory/`) to **adaptery narzedziowe** - powinny linkowac do canonical files i unikac duplikacji tresci (`documentation/ai/README.md` linia 3, 10).

To znaczy, ze warstwy z DOCS-MAP powinny byc oceniane przez pryzmat tej polityki: czy respektuja podzial canonical vs adapter? Obecna sytuacja - gdzie S.O.T. architektury jest w `.github/instructions/` a S.O.T. konwencji kodowania w `factory/` - **narusza te nadrzedna zasade**. Obie te tresci to wiedza projektowa, nie konfiguracja narzedzi.

---

## Zidentyfikowane problemy

### Problem 1: Warstwa A nie jest warstwa - to etykieta na 4 rozne miejsca

**Warstwa A** ("Instrukcje AI-First") obejmuje:
- `.github/instructions/` - reguly architektoniczne
- `factory/prompts/` - prompty agentow
- `CLAUDE.md` - instrukcje projektu
- `.github/copilot-instructions.md` - instrukcje Copilota

**Dlaczego to problem**: Te pliki laczy tylko jedno - "AI je czyta". Ale ich tresc jest fundamentalnie rozna:
- Reguly architektoniczne to **wiedza projektowa** (istnieje niezaleznie od AI)
- Prompty agentow to **konfiguracja narzedzi** (istnieje tylko dla AI)
- CLAUDE.md to **punkt wejscia** (meta-dokument)

Kryterium "kto czyta" nie tworzy spojnej warstwy. Architektura Clean Architecture obowiazuje nawet gdyby nie bylo zadnego AI.

### Problem 2: `.github/instructions/` to nieoczywiste miejsce na architekture

- `.github/` to konwencja GitHub na: workflows, issue templates, PR templates, CODEOWNERS
- `instructions/` nie jest standardowym katalogiem GitHub (GitHub rozpoznaje tylko `.github/copilot-instructions.md` i `.github/instructions/*.instructions.md` dla Copilota)
- **Skutek**: Nowy developer szukajacy architektury projektu nie pomysli zeby zajrzec do `.github/`
- **Kontekst**: Pliki `*.instructions.md` sa tam bo Copilot je automatycznie laduje - to decyzja toolingowa, nie organizacyjna

### Problem 3: `factory/` miesza meta-narzedzia z wiedza projektowa

Pliki w `factory/` dziela sie na dwie kategorie:

**Wiedza o projekcie** (S.O.T. dla rzeczywistych aspektow systemu):
- `AUDIT-SERVER.md` - S.O.T. konwencji kodowania serwera
- `AUDIT-CLIENT.md` - S.O.T. konwencji kodowania klienta
- `SYSTEM-MAP.md` - historycznie S.O.T. mapy API serwer-klient (obecnie `documentation/team/architecture/system-map.md`)

**Meta-narzedzia fabryki** (istnieja tylko dla procesu AI):
- `CONCEPT.md`, `CONCEPT-DIAGRAMS.md` - co to jest Dark Factory
- `TOOL-ADAPTERS.md`, `adapters/*` - jak narzedzia maja pracowac
- `prompts/*` - prompty agentow
- `STATUS.md`, `PROMPTS-SESSIONS.md` - stan procesu
- `FACTORY-FLOW.md` - diagram przeplywu fabryki

**Skutek**: Zeby znalezc "jakie sa konwencje kodowania na serwerze" musisz wiedziec, ze historycznie S.O.T. bylo w `factory/AUDIT-SERVER.md` (obecnie `documentation/team/architecture/conventions/coding-server.md`) - co bylo nieintuicyjne.

### Problem 4: `documentation/team/operations/` miesza dwa rozne typy tresci

Zawiera jednoczesnie:
- **Procedury stale**: `db-changes.md`, `deployment-heroku.md`, `post-change-checklist.md`, `documentation-migration-plan.md` (Warstwa C - wiedza operacyjna)
- **Dokumentacja feature'ow**: `contract-meeting-notes/`, `persons-v2-refactor/`, `hr-module/`, `profile-import/`, `public-profile-submission/`, `documentation-migration/` (Warstwa B - pamiec stanu)

To dwa rozne typy dokumentow o roznym cyklu zycia:
- Procedury stale zyja dlugo i ewoluuja powoli
- Dokumentacja feature'ow jest tymczasowa i gesto aktualizowana

**Korekta**: Ten miks jest czesciowo **celowy** i jawnie zapisany w `documentation/team/README.md` (linie 9, 20-40). Operations to "miejsce operacyjne" obejmujace zarowno procedury zmian jak i dokumentacje feature'ow. To swiadoma decyzja, nie przypadek - choc nadal utrudnia nawigacje.

### Problem 5: Warstwa V jest sztuczna

- Zawiera: 1 plik (`documentation/team/architecture/system-context.md`) + odniesienie do `factory/CONCEPT-DIAGRAMS.md`
- Za malo tresci zeby uzasadnic osobna warstwe
- Diagramy naturalnie przynaleza do dokumentu ktory opisuja (architektura, koncepcja), nie do osobnej "warstwy wizualizacji"

### Problem 6: CLAUDE.md pelni zbyt wiele rol jednoczesnie

CLAUDE.md jest jednoczesnie:
1. **Punkt wejscia** dla Claude Code (meta-rola)
2. **Podsumowanie architektury** (duplikuje `.github/instructions/architektura.instructions.md`)
3. **Quick start** (duplikuje `documentation/team/onboarding/`)
4. **Deprecated patterns** (unikalne, nie ma tego nigdzie indziej)
5. **Konfiguracja factory review** (duplikuje `factory/` informacje)

**Niuans**: Zasada "root-level .md powinny byc redirectami" dotyczy glownie dokumentacji operacyjnej (wg `documentation/team/README.md` i `documentation/ai/README.md`). CLAUDE.md pelni podwojna role: jest zarowno **adapterem narzedzia** (punkt wejscia Claude Code - ta rola wymaga pewnej ilosci inline tresci) jak i dokumentem operacyjnym (quick start, deprecated patterns). Problem nie w tym ze CLAUDE.md ma tresc, ale ze zawiera za duzo zduplikowanej wiedzy operacyjnej zamiast linkowac do canonical sources.

### Problem 7: Brak jasnego kryterium podzialu

Obecne warstwy mieszaja trzy rozne osie podzialu:
- **Kto czyta**: AI vs czlowiek (Warstwa A vs reszta)
- **Typ tresci**: reguly vs procedury vs plany (A vs C vs B)
- **Cykl zycia**: stale vs tymczasowe (procedury vs feature docs)

Brak jednej spojnej osi powoduje, ze podzial jest trudny do zapamietania i stosowania.

---

## Mapa napiec: Gdzie S.O.T. jest nieintuicyjny

| Pytanie developera | Intuicyjne miejsce | Faktyczny S.O.T. |
|---|---|---|
| "Jakie sa reguly architektury?" | `docs/` lub README | `.github/instructions/architektura.instructions.md` |
| "Jakie sa konwencje kodowania?" | `docs/` lub `.editorconfig` | `documentation/team/architecture/conventions/coding-server.md` (historycznie: `factory/AUDIT-SERVER.md`) |
| "Jaka jest mapa API?" | `docs/` lub `src/` | `documentation/team/architecture/system-map.md` (historycznie: `factory/SYSTEM-MAP.md`) |
| "Jak zrobic review kodu?" | `documentation/team/runbooks/` | `factory/prompts/reviewer.md` |
| "Jak skonfigurowac srodowisko?" | `documentation/team/onboarding/environment.md` | `documentation/team/onboarding/environment.md` (OK) |
| "Jak uruchomic testy?" | `documentation/team/runbooks/testing.md` | `documentation/team/runbooks/testing.md` (OK) |

Wniosek: Warstwa C (`documentation/team/`) jest intuicyjna. Problemy sa w Warstwie A (`.github/instructions/` + `factory/`).

---

## Podsumowanie

**Co dziala dobrze:**
- `documentation/team/onboarding/` i `documentation/team/runbooks/` - klarowne, intuicyjne
- Trojka plan/progress/activity-log per feature - dobry wzorzec
- `DOCS-MAP.md` jako indeks - wartosciowy dokument
- Polityka canonical + adapters w `documentation/ai/README.md` - jasna i poprawna

**Co nie dziala:**
1. Warstwa A to nie warstwa, to rozproszona kategoria
2. Architektura w `.github/instructions/` jest tam z powodow toolingowych (Copilot), nie organizacyjnych
3. `factory/` miesza wiedze projektowa z meta-narzedziami
4. `documentation/team/operations/` miesza procedury stale z dokumentacja feature'ow (celowe, ale utrudnia nawigacje)
5. Warstwa V nie ma sensu jako osobna warstwa
6. CLAUDE.md duplikuje zamiast redirectowac
7. Brak jednej spojnej osi podzialu warstw
