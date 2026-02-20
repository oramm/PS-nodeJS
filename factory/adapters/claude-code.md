# Adapter - Claude Code

## Uzycie
1. Na starcie sesji:
   - przeczytaj `CLAUDE.md`,
   - przeczytaj `factory/TOOL-ADAPTERS.md`,
   - zaladuj tylko Warstwe A.
2. Trzymaj workflow:
   - `Plan -> Implementacja -> Review -> Test -> Docs -> Commit`.
3. Review realizuj przez `factory/prompts/reviewer.md`.
4. Gdy 3x z rzedu `REQUEST_CHANGES` lub fail testow -> eskaluj do czlowieka.
5. Przy planie taska uzupelnij:
   - `required_context_files`
   - `optional_context_files`
   - `context_budget_tokens`

## Prompt startowy (copy/paste)

```text
Pracuj wg CLAUDE.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Start tylko z Warstwa A.
Wymusz workflow Dark Factory:
Plan -> Implementacja -> Review loop -> Test -> Docs -> Commit.
Do review uzyj factory/prompts/reviewer.md.
Warstwe B/C doladuj tylko gdy task tego wymaga.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens.
Po 3 nieudanych iteracjach eskaluj do czlowieka.
```
