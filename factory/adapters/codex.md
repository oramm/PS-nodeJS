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
