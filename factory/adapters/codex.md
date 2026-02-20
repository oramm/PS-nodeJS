# Adapter - Codex

## Uzycie
1. Na starcie sesji:
   - przeczytaj `AGENTS.md`,
   - przeczytaj `factory/TOOL-ADAPTERS.md`,
   - zaladuj tylko Warstwe A.
2. Potwierdz workflow:
   - `Plan -> Implementacja -> Review -> Test -> Docs -> Commit`.
3. Po implementacji zawsze odpal review wg `factory/prompts/reviewer.md`.
4. Commit dopiero po `APPROVE`.
5. Przy planie taska uzupelnij:
   - `required_context_files`
   - `optional_context_files`
   - `context_budget_tokens`

## Prompt startowy (copy/paste)

```text
Pracuj wg AGENTS.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Start tylko z Warstwa A.
Zastosuj workflow Dark Factory:
Plan -> Implementacja -> Review loop -> Test -> Docs -> Commit.
Review wykonaj promptem factory/prompts/reviewer.md.
Warstwe B/C doladuj tylko gdy task tego wymaga.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens.
Nie koncz zadania bez APPROVE.
```
