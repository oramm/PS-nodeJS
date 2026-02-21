# Dark Factory - Tool Adapters (Codex / Claude / Copilot)

> Cel: ten sam workflow Dark Factory niezaleznie od narzedzia.
> Zrodlo prawdy koncepcji: `factory/CONCEPT.md`
> Diagramy: `factory/CONCEPT-DIAGRAMS.md`
> Mapa S.O.T.: `factory/DOCS-MAP.md`

## 1. Wspolny protokol (obowiazuje wszedzie)

Kazde zadanie przechodzi sekwencje:
1. Plan i kryteria akceptacji.
2. Implementacja taska.
3. Testy wg `factory/prompts/tester.md` (TEST_VERDICT: TEST_PASS | TEST_FAIL).
4. Review loop (`APPROVE` albo `REQUEST_CHANGES`, max 3 iteracje) — reviewer dostaje TEST_REPORT.
5. Aktualizacja docs (jesli dotyczy).
6. Commit po approve.

Hard rules:
- `Reviewer != Coder` (swieze spojrzenie).
- Escalacja do czlowieka po 3 nieudanych iteracjach review/test.
- Checkpoint czlowieka przy decyzjach architektonicznych i finalnym merge.
- Balans iteracji: 50/50 (1 task funkcjonalny + 1 task techniczny/refactor, o ile ma sens).

## 1a. Context Gate v1 (obowiazkowy)

### Warstwa A (always-on)
- `factory/CONCEPT.md`
- `factory/TOOL-ADAPTERS.md`
- `factory/prompts/tester.md`
- `factory/prompts/reviewer.md`

### Warstwa B (task-scoped)
- Architektura backend: `.github/instructions/architektura.instructions.md`
- Testy: `.github/instructions/architektura-testowanie.md`
- API i kontrakty: `factory/SYSTEM-MAP.md`, `src/types/types.d.ts`
- Operacje env/deploy/db: `docs/team/onboarding/*`, `docs/team/operations/*`

### Warstwa C (deep-dive fallback)
- `factory/AUDIT-SERVER.md`
- `factory/AUDIT-CLIENT.md`
- `.github/instructions/architektura-szczegoly.md`
- `.github/instructions/architektura-ai-assistant.md`

Reguly ladowania:
- Start zawsze od Warstwy A.
- Warstwa B tylko pod konkretny typ taska.
- Warstwa C tylko po triggerze "missing detail" lub blockerze review.
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
Start tylko z Warstwa A:
- factory/CONCEPT.md
- factory/TOOL-ADAPTERS.md
- factory/prompts/reviewer.md
Warstwe B/C doladuj tylko gdy task tego wymaga.
Wymus workflow: Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Nie koncz zadania bez review APPROVE.
```

## 3. Adapter: Codex

Uzyj:
- `AGENTS.md` (reguly repo dla Codex)
- `factory/adapters/codex.md` (checklista sesji)

W praktyce:
- przypomnij workflow w pierwszej wiadomosci,
- po kazdej zmianie uruchom review wg `factory/prompts/reviewer.md`.

## 4. Adapter: Claude Code

Uzyj:
- `CLAUDE.md` (instrukcje dla Claude Code)
- `factory/adapters/claude-code.md` (checklista sesji)

W praktyce:
- zacznij od polecenia "przeczytaj CLAUDE.md + adapter",
- egzekwuj review loop i limity iteracji.

## 5. Adapter: Copilot (VS Code)

Uzyj:
- `.github/copilot-instructions.md`
- `factory/adapters/copilot-vscode.md`

W praktyce:
- rozpoczynaj chat od promptu bootstrap,
- prowadz review i testy jawnie (Copilot nie zrobi orkiestracji sam).

## 6. Escalacja i decyzje

Agent ma pytac czlowieka, gdy:
- decyzja dotyczy architektury/interfejsu publicznego,
- review/test failuje 3 razy,
- wymaganie jest niejednoznaczne,
- wykryto ryzyko bezpieczenstwa.

## 7. Artefakty sesji

Po kazdej wiekszej iteracji:
- aktualizuj `factory/STATUS.md`,
- dla kolejnej sesji dopisz prompt w `factory/PROMPTS-SESSIONS.md`.
- przy planie taska uzupelnij pola:
  - `required_context_files`
  - `optional_context_files`
  - `context_budget_tokens`
