# Factory Build Status

## Stan: Warstwa 4 - Auto-docs DONE
## Data: 2026-02-22

## Architektura systemu
- SERWER: PS-nodeJS - Express.js/TypeScript backend z Clean Architecture, MariaDB, integracje Google APIs/KSeF.
- KLIENT: ENVI.ProjectSite - React 18 + Bootstrap 5 + react-hook-form, Webpack, Vitest, GitHub Pages.

## Co zrobiono
- [x] Audyt struktury serwerowej (332 pliki TS, ok. 7600 LOC, 253 endpointy)
- [x] Analiza `CLAUDE.md` (327 linii, 15+ sekcji)
- [x] Dokumentacja wzorcow kodu serwera (Singleton Controller, BaseRepository, Validator, withAuth)
- [x] Inwentaryzacja narzedzi jakosci serwera (Jest, Prettier, TSC strict)
- [x] Mapa API serwera
- [x] Analiza git (branching + konwencje commitow)
- [x] Audyt klienta (272 pliki TS/TSX, ok. 25800 LOC)
- [x] Analiza stack klienta (Webpack 5, Vitest, react-hook-form + yup, HashRouter)
- [x] Dokumentacja wzorcow klienta (RepositoryReact, GeneralModal, FilterableTable, `*Api.ts`)
- [x] Inwentaryzacja testow klienta
- [x] Mapa systemu serwer <-> klient (`documentation/team/architecture/system-map.md`)
- [x] Reviewer agent (warstwa 1)
- [x] Koncepcja Dark Factory (`factory/CONCEPT.md`)
- [x] Diagramy koncepcji (`factory/CONCEPT-DIAGRAMS.md`)
- [x] Aktualizacja mapy S.O.T. (`documentation/team/operations/docs-map.md`)
- [x] Cross-tool adaptery (`factory/TOOL-ADAPTERS.md`, `factory/adapters/*`, `.github/copilot-instructions.md`)
- [x] Context Gate v1 (Low-Context First) + budget kontekstu
- [x] Szablon planowania kontekstu taska (`factory/templates/task-plan-context.yaml`)
- [x] Test pipeline (warstwa 2)
- [x] Planner (warstwa 3)
- [x] Auto-docs (warstwa 4)

## Warstwa 1 - Reviewer Agent

### Co powstalo
1. `factory/prompts/reviewer.md` - prompt reviewera (konkretny dla ENVI stack)
2. `documentation/team/operations/docs-map.md` - mapa zrodel prawdy (S.O.T.)
3. `CLAUDE.md` - sekcja "Factory: Review Process"

### Test review loop (healthCheck na `ToolsDb.ts`)
- VERDICT: `APPROVE` (z uwagami MEDIUM + LOW)
- Wykryte:
  - [MEDIUM] kruche internal API (`pool.pool.config.connectionLimit`)
  - [LOW] cichy catch bez logowania
- Pozytywy:
  - poprawne `try/finally` z `conn.release()`
  - uzycie istniejacego helpera polaczenia
  - spojnosc ze stylem klasy

## Update tej iteracji: Koncepcja i lekki audyt spojnosci

Zakres wykonany:
- Uzupelniono `factory/CONCEPT.md` jako kanoniczny opis procesu Dark Factory.
- Dodano `factory/CONCEPT-DIAGRAMS.md` (Mermaid, wersja human-friendly).
- Zachowano role `documentation/team/operations/docs-map.md` jako mapy S.O.T.
- Spieto cross-linki miedzy `CONCEPT`, `STATUS`, `DOCS-MAP`.
- Potwierdzono brak konfliktu koncepcji z `factory/prompts/reviewer.md`.
- Dodano adaptery procesu dla Codex/Claude/Copilot.
- Dodano Context Gate v1 (Warstwa A/B/C) i soft budget kontekstu.
- Dodano interfejs planowania taska: `required_context_files`, `optional_context_files`, `context_budget_tokens`.
- Hooki/skrypty oznaczone jako etap opcjonalny po 2-3 sesjach pilota.

## Kluczowe obserwacje (stan bazowy)

### Serwer
- Clean Architecture jest dobrze opisana i wdrazana.
- Najwieksza przestrzen automatyzacji: CI/CD, lintery, pre-commit.

### Klient
- Widoczne miejsca ryzyka utrzymaniowego (duze komponenty, niespojny styl API).
- Niski poziom automatyzacji jakosci.

### Cross-system
- Konwencja `_` prefix jest spojna po obu stronach.
- Typy klient/serwer utrzymywane recznie (ryzyko dryfu).

## Warstwa 2 - Test Pipeline

### Co powstalo
1. `factory/prompts/tester.md` â€” prompt agenta testujacego (TEST_VERDICT: TEST_PASS | TEST_FAIL)
2. Sekcja E) TEST CONTEXT w `factory/prompts/reviewer.md` (wstecznie kompatybilna)
3. Pipeline odwrocony na `Test -> Review` we wszystkich dokumentach i adapterach
4. `tester.md` dodany do Context Gate Warstwa A

## Warstwa 3 - Planner

### Co powstalo
1. `factory/prompts/planner.md` â€” prompt Planner Agenta (Architekt-Strateg, YAML kontrakt)
2. Sekcje Planner w adapterach: `claude-code.md` (Plan Mode, subagenty, worktrees), `codex.md` (interactive + headless), `copilot-vscode.md` (Copilot Edits agent mode, #file pinning)
3. Rozszerzenie `factory/templates/task-plan-context.yaml` o pola: `technical_objectives`, `verification_criteria`, `escalation_triggers`, `context_budget`, `plan_deviation`
4. Sekcja "Lekka Orkiestracja" w `factory/TOOL-ADAPTERS.md`
5. `planner.md` dodany do Context Gate Warstwa A (CLAUDE.md + copilot-instructions.md)
6. Wpis `planner.md` w `documentation/team/operations/docs-map.md` (sekcja 9)

### Kluczowe decyzje
- Planner = Architekt-Strateg (definiuje CO i granice), Coder = fachowiec (decyduje JAK)
- Output Plannera: YAML kontrakt + human checkpoint (PLAN_APPROVED / PLAN_REJECTED)
- PLAN_DEVIATION_REPORT: Coder moze odrzucic plan przy blokerze; max 2 rundy poprawek
- Anty-mikrozarzadzanie: brak listy krokow implementacji â€” tylko cele i constraints

## Nastepny krok
Sesja 5 - Committer (standaryzacja commitow/PR)
Prompt: `factory/PROMPTS-SESSIONS.md`
