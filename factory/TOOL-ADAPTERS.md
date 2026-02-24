# Dark Factory - Tool Adapters (Codex / Claude / Copilot)

> Cel: ten sam workflow Dark Factory niezaleznie od narzedzia.
> Zrodlo prawdy koncepcji: `factory/CONCEPT.md`
> Diagramy: `factory/CONCEPT-DIAGRAMS.md`
> Mapa S.O.T.: `documentation/team/operations/docs-map.md`

## 1. Wspolny protokol (obowiazuje wszedzie)

Kazde zadanie przechodzi sekwencje:
1. Plan i kryteria akceptacji.
2. Implementacja taska.
3. Testy wg `factory/prompts/tester.md` (`TEST_VERDICT: TEST_PASS | TEST_FAIL`).
4. Review loop (`APPROVE` albo `REQUEST_CHANGES`, max 3 iteracje) - reviewer dostaje `TEST_REPORT`.
5. Aktualizacja docs (jesli dotyczy).
6. Commit request od orchestratora (`COMMIT_REQUEST` + `COMMIT_APPROVED`).
7. Commit przez `factory/prompts/committer.md`.

Hard rules:
- `Reviewer != Coder` (swieze spojrzenie).
- Escalacja do czlowieka po 3 nieudanych iteracjach review/test.
- Checkpoint czlowieka przy decyzjach architektonicznych i finalnym merge.
- Zmiana workflow/polityki w Factory musi miec `cross-tool parity`:
  - obowiazkowe odwzorowanie w `factory/adapters/codex.md`, `factory/adapters/claude-code.md`, `factory/adapters/copilot-vscode.md`.
- Balans iteracji: 50/50 (1 task funkcjonalny + 1 task techniczny/refactor, o ile ma sens).
- Committer NIE wykonuje `git add .` ani `git add -A`; staging tylko z `files_changed` lub staged-only.
- W V1 gate `TEST_PASS/APPROVE/DOCS_SYNC_DONE` sa deklarowane przez orchestratora w `COMMIT_REQUEST` (state-store planowany w V2).

## 1a. Documentation Layer Selection (obowiazkowe)

### Backend (PS-nodeJS) - 3 warstwy
- `Canonical`: `documentation/team/`
- `Adaptery`: `.github/instructions/`, `CLAUDE.md`, `AGENTS.md`, `.claude/`
- `Factory`: `factory/`

### Klient (ENVI.ProjectSite) - 2 warstwy
- `Canonical`: `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\` + `C:\Apache24\htdocs\ENVI.ProjectSite\documentation\operations\`
- `Adaptery`: `C:\Apache24\htdocs\ENVI.ProjectSite\CLAUDE.md`, `C:\Apache24\htdocs\ENVI.ProjectSite\.github\copilot-instructions.md`, `C:\Apache24\htdocs\ENVI.ProjectSite\AGENTS.md`

Reguly ladowania:
- Wybieraj tylko warstwy potrzebne do taska.
- Priorytet czytania: `Canonical` -> `Adaptery` -> `Factory` (tylko meta-narzedzia).
- Dla frontend/cross-repo obowiazkowo weryfikuj kontrakt API po stronie backend:
  - `documentation/team/architecture/system-map.md`
  - `src/types/types.d.ts`
- Zakaz ladowania calego audytu bez uzasadnienia.

Budzet:
- `context_budget_tokens`: 12000-20000 (soft).
- `required_context_files`: max 5-8 plikow.

Hooks/skrypty:
- na tym etapie opcjonalne (nie wymagane),
- decyzja po 2-3 sesjach pilota recznego.

## 2. Start sesji (prompt bootstrap)

Na poczatku sesji podaj agentowi:

```text
Pracuj w trybie Dark Factory (Low-Context First).
Stosuj model dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Laduj tylko warstwy potrzebne do taska.
Wymus workflow: Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Nie koncz zadania bez review APPROVE.
Commit uruchamiaj przez Committer dopiero po jawnym `COMMIT_APPROVED`.
```

## 3. Adapter: Codex

Uzyj:
- `AGENTS.md` (reguly repo dla Codex)
- `factory/adapters/codex.md` (checklista sesji)
- `factory/prompts/committer.md` (gate + bezpieczny commit)

W praktyce:
- przypomnij workflow w pierwszej wiadomosci,
- po kazdej zmianie uruchom review wg `factory/prompts/reviewer.md`.
- commit wykonuj przez `factory/prompts/committer.md` po `COMMIT_APPROVED`.

## 4. Adapter: Claude Code

Uzyj:
- `CLAUDE.md` (instrukcje dla Claude Code)
- `factory/adapters/claude-code.md` (checklista sesji)
- `factory/prompts/committer.md`

W praktyce:
- zacznij od polecenia "przeczytaj CLAUDE.md + adapter",
- egzekwuj review loop i limity iteracji.
- po docs uruchom commit tylko przez Committer (`COMMIT_APPROVED`).

## 5. Adapter: Copilot (VS Code)

Uzyj:
- `.github/copilot-instructions.md`
- `factory/adapters/copilot-vscode.md`
- `factory/prompts/committer.md`

W praktyce:
- rozpoczynaj chat od promptu bootstrap,
- prowadz review i testy jawnie (Copilot nie zrobi orkiestracji sam).
- commit wykonuj tylko po `COMMIT_APPROVED` i przez prompt Committera.

## 5a. Lekka orkiestracja (anty-mikrozarzadzanie)

Planner definiuje **cele i granice** (`technical_objectives` + `constraints`).
Coder (fachowiec) decyduje o narzedziach i kolejnosci - nie dostaje listy krokow.

Subagenci przy delegowaniu zawsze otrzymuja:
- wybrane warstwy dokumentacji dla taska,
- skrocony opis zasad Dark Factory.

Izolowany kontekst subagenta nie dziedziczy zasad automatycznie.

`PLAN_DEVIATION_REPORT`: Coder moze odrzucic plan jesli odkryje przeszkode.
Max 2 rundy poprawki - czlowiek jest arbitrem zmiany scope.

### Planner Gate (kiedy pominac / kiedy wymagany)

- Dla zmian `low-risk` Planner moze byc pominiety:
  - 1-2 pliki,
  - brak zmian DB/env/deploy,
  - brak zmian kontraktu API/public interface,
  - brak decyzji architektonicznych.
- Przy pominieciu Plannera Coder MUSI zapisac krotkie uzasadnienie w raporcie sesji (`planner_skipped_reason`).
- Niezaleznie od decyzji o Plannerze zawsze obowiazuje: `Test -> Review (Reviewer != Coder) -> APPROVE`.
- Planner jest wymagany, gdy zachodzi przynajmniej jeden warunek:
  - zmiany architektury lub publicznego API,
  - zmiany DB/env/deploy,
  - task wieloetapowy lub cross-repo o podwyzszonym ryzyku.
- Dla taskow seed-stage o wysokiej niepewnosci uruchom `DISCOVERY_MODE`:
  - iteracyjny dialog z czlowiekiem,
  - analiza as-is przed finalnym YAML,
  - gate: `DISCOVERY_APPROVED` przed `PLAN_APPROVED`.

## 6. Escalacja i decyzje

Agent ma pytac czlowieka, gdy:
- decyzja dotyczy architektury/interfejsu publicznego,
- review/test failuje 3 razy,
- wymaganie jest niejednoznaczne,
- wykryto ryzyko bezpieczenstwa.

## 7. Artefakty sesji

Po kazdej wiekszej iteracji:
- aktualizuj `factory/STATUS.md`,
- dla kolejnej sesji dopisz prompt w `factory/PROMPTS-SESSIONS.md`,
- przy planie taska uzupelnij pola:
  - `required_context_files`
  - `optional_context_files`
  - `context_budget_tokens`
  - `documentation_layers`
  - `documentation_selection_justification`
  - `operations_feature_slug` (jesli task mapuje sie do `documentation/team/operations/*`)
  - `operations_docs_path` (pelna sciezka katalogu docs dla Documentarian)
