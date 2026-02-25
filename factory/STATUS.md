# Factory Build Status

## Stan: Warstwa 5 DONE + V1.1 Orchestrator Assistant Protocol DONE
## Data: 2026-02-25

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
- [x] Auto-docs + Close&Purge (warstwa 4)
- [x] Committer v1 (warstwa 5)

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
3. Rozszerzenie `factory/templates/task-plan-context.yaml` o pola: `technical_objectives`, `verification_criteria`, `escalation_triggers`, `context_budget`, `plan_deviation`, `docs_sync_targets`, `closure_policy`, `closure_gate`
4. Sekcja "Lekka Orkiestracja" w `factory/TOOL-ADAPTERS.md`
5. `planner.md` dodany do Context Gate Warstwa A (CLAUDE.md + copilot-instructions.md)
6. Wpis `planner.md` w `documentation/team/operations/docs-map.md` (sekcja 9)

### Kluczowe decyzje
- Planner = Architekt-Strateg (definiuje CO i granice), Coder = fachowiec (decyduje JAK)
- Output Plannera: YAML kontrakt + human checkpoint (PLAN_APPROVED / PLAN_REJECTED)
- PLAN_DEVIATION_REPORT: Coder moze odrzucic plan przy blokerze; max 2 rundy poprawek
- Anty-mikrozarzadzanie: brak listy krokow implementacji â€” tylko cele i constraints

## Warstwa 5 - Committer v1

### Co powstalo
1. `factory/prompts/committer.md` - prompt Committer Agenta (gate `COMMIT_APPROVED`, `COMMIT_REQUEST`, `COMMIT_REPORT`)
2. Integracja etapu Committer w adapterach:
   - `factory/adapters/codex.md`
   - `factory/adapters/claude-code.md`
   - `factory/adapters/copilot-vscode.md`
   - `.github/copilot-instructions.md`
3. Aktualizacja flow i koncepcji:
   - `factory/FACTORY-FLOW.md`
   - `factory/TOOL-ADAPTERS.md`
   - `factory/CONCEPT.md`
4. Aktualizacja mapy S.O.T.:
   - `documentation/team/operations/docs-map.md`
5. Aktualizacja wejscia Claude:
   - `CLAUDE.md` (wzmianka o etapie Committer)

### Kluczowe decyzje
- V1: orchestrator = czlowiek.
- Commit tylko po jawnym `COMMIT_APPROVED`.
- V1 trust model: `TEST_PASS`, `REVIEW_APPROVE`, `DOCS_SYNC_DONE` sa deklarowane w `COMMIT_REQUEST`.
- Bezpieczenstwo: zakaz `git add .` i `git add -A`; staging tylko `files_changed` lub staged-only.
- Zakres v1: commit only (bez push/PR).

## Nastepny krok
Sesja 6 - Stateful orchestration gate (plan/YAML jako source of truth)
Prompt: `factory/PROMPTS-SESSIONS.md`

## Update v1.1 - Asystent Orkiestratora + sharding + context rollover

### Co powstalo
1. Formalizacja roli `Asystent Orkiestratora` (no-edit policy) w:
   - `factory/CONCEPT.md`
   - `factory/TOOL-ADAPTERS.md`
   - `factory/FACTORY-FLOW.md`
2. Definicja `Integrator Gate` (owner: Asystent Orkiestratora, bez implementacji kodu).
3. Definicja shardowania (`parallel` vs `sequential`) i kryteriow no-shard.
4. Context Rollover Protocol:
   - pre-session budget check (Krok 0),
   - runtime trigger `remaining_context_capacity <= 40%`,
   - 4 obowiazkowe artefakty handoff.
5. Szablon eskalacji po 3x fail (`ESCALATION_REPORT`) i fallback resume.
6. Rozszerzenie YAML kontraktu (`factory/templates/task-plan-context.yaml`) o:
   - `execution_model: orchestrator_v1`,
   - `main_agent_policy`,
   - `parallelization`,
   - `integration_gate`,
   - `context_rollover`,
   - `session_resume_contract`.
7. Cross-tool parity (conceptual parity) odwzorowane w adapterach:
   - `factory/adapters/codex.md`
   - `factory/adapters/claude-code.md`
   - `factory/adapters/copilot-vscode.md`

### Kluczowe decyzje v1.1
- Integrator owner: Asystent Orkiestratora.
- Parity: konceptualna (role, gate'y, artefakty, statusy), nie identyczne komendy.
- `execution_model`: `orchestrator_v1`.
- Hard rule: Asystent Orkiestratora nie implementuje kodu bezposrednio.

## Update v1.1 parity-fix - Prompt entries for Orchestrator Assistant and Coder

### Data
- 2026-02-25

### Co powstalo
- Dodano `factory/prompts/orchestrator-assistant.md` (rola operacyjna + Integrator Gate, no-code hard rule).
- Dodano `factory/prompts/coder.md` (implementacja shardu, ownership boundaries, retry limits).
- Ujednolicono referencje cross-tool w:
  - `factory/TOOL-ADAPTERS.md`
  - `factory/adapters/codex.md`
  - `factory/adapters/claude-code.md`
  - `factory/adapters/copilot-vscode.md`
- Zaktualizowano mapowanie S.O.T. w `documentation/team/operations/docs-map.md`.
