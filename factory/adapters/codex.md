# Adapter - Codex

## Uzycie
1. Na starcie sesji:
   - przeczytaj `AGENTS.md`,
   - przeczytaj `factory/TOOL-ADAPTERS.md`,
   - zaladuj tylko Warstwe A.
2. Potwierdz workflow:
   - `Plan -> Implementacja -> Test -> Review -> Docs -> Commit`.
3. Po implementacji uruchom testy wg `factory/prompts/tester.md`.
4. Wynik TEST_REPORT przekaz do review wg `factory/prompts/reviewer.md`.
5. Commit dopiero po `APPROVE`.
5. Przy planie taska uzupelnij:
   - `required_context_files`
   - `optional_context_files`
   - `context_budget_tokens`

## Planner (Warstwa 3)

### Tryby pracy Plannera w Codex

**Interactive (CLI/TUI):**
- Uruchom Codex w trybie interaktywnym.
- Opisz task i zlec: "Wygeneruj plan wg factory/prompts/planner.md. NIE implementuj."
- Codex generuje YAML i wyświetla w CLI z oczekiwaniem na zatwierdzenie.
- Zatwierdź (`PLAN_APPROVED`) lub odrzuć (`PLAN_REJECTED: powód`) bezpośrednio w CLI.

**Headless — polityka projektowa Dark Factory (Team Policy):**

Rozdzielenie sesji na planowanie i implementację to **polityka projektowa**, nie ograniczenie techniczne. Cel: pełny audit trail dla CI/CD.

```bash
# Wywołanie 1: tylko planowanie
codex exec "Wygeneruj plan taska X wg factory/prompts/planner.md. Zapisz do factory/plans/{task-id}.yaml. NIE implementuj."

# Po human review: dodaj PLAN_APPROVED: true do YAML

# Wywołanie 2: implementacja (tylko po PLAN_APPROVED: true w pliku)
codex exec "Zaimplementuj task wg factory/plans/{task-id}.yaml (status: PLAN_APPROVED)."
```

Skrót: `codex e "..."` (alias dla `codex exec`).

AGENTS.md musi zawierać regułę:
`"Nie implementuj bez jawnego PLAN_APPROVED od człowieka lub pola PLAN_APPROVED: true w pliku planu."`

### PLAN_DEVIATION_REPORT w headless

Coder dopisuje do pliku planu:
```yaml
plan_deviation:
  discovered: "..."
  proposal: "..."
```
CI/CD wykrywa `plan_deviation` i pauzuje — człowiek arbiter. Max 2 iteracje poprawki.

## Prompt startowy (copy/paste)

```text
Pracuj wg AGENTS.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Start tylko z Warstwa A.
Zastosuj workflow Dark Factory:
Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Testy wykonaj wg factory/prompts/tester.md.
Review wykonaj promptem factory/prompts/reviewer.md (przekaz TEST_REPORT).
Warstwe B/C doladuj tylko gdy task tego wymaga.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens.
Nie koncz zadania bez APPROVE.
```
