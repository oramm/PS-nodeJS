# Adapter - Claude Code

## Uzycie
1. Na starcie sesji:
   - przeczytaj `CLAUDE.md`,
   - przeczytaj `factory/TOOL-ADAPTERS.md`,
   - zaladuj tylko Warstwe A.
2. Trzymaj workflow:
   - `Plan -> Implementacja -> Test -> Review -> Docs -> Commit`.
3. Po implementacji uruchom testy wg `factory/prompts/tester.md`.
4. Wynik TEST_REPORT przekaz do review wg `factory/prompts/reviewer.md`.
5. Gdy 3x z rzedu `REQUEST_CHANGES` lub fail testow -> eskaluj do czlowieka.
5. Przy planie taska uzupelnij:
   - `required_context_files`
   - `optional_context_files`
   - `context_budget_tokens`

## Planner (Warstwa 3)

### Plan Mode — uruchomienie

Uruchom Plan Mode **przed** eksploracją (bezpieczna eksploracja bez zmian w plikach).

Dwie metody:
- W sesji interaktywnej: **Shift+Tab** dwukrotnie (Normal → Auto-Accept → Plan Mode)
- Nowa sesja od razu w Plan Mode:
  ```bash
  claude --permission-mode plan
  ```

> Uwaga: skróty i flagi zależą od wersji Claude Code — weryfikuj w `/help` aktualnej instalacji.

Po fazie planowania i uzyskaniu PLAN_APPROVED:
**Otwórz nową sesję bez `--permission-mode plan`** — Coder startuje z czystym kontekstem skupionym wyłącznie na implementacji.

### Subagenty do eksploracji (izolacja kontekstu)

Użyj Task tool (subagent Explore) do wąskiej eksploracji modułów.
Subagent chroni główny kontekst — czyta pliki i zwraca tylko wnioski, nie pełne pliki.
Zawsze przekazuj subagentowi: "Pracujesz w projekcie ENVI. Zasady: factory/CONCEPT.md."
Zakres subagenta = `context_budget.subagent_scope` z YAML kontraktu.

### Worktrees (opcjonalnie)

Gdy task dotyka >2 modułów lub istnieje ryzyko konfliktu z bieżącą pracą, użyj worktree:
```bash
claude --worktree {task-name}
```
Coder pracuje w izolowanym worktree. Merge po APPROVE.

### PLAN_DEVIATION_REPORT

Jeśli Coder odkryje przeszkodę: wraca do Plan Mode (nowa sesja `--permission-mode plan`).
Planner generuje poprawiony kontrakt → nowy human checkpoint.
Max 2 rundy — po 2 bez rozwiązania → eskalacja do człowieka.

## Prompt startowy (copy/paste)

```text
Pracuj wg CLAUDE.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Start tylko z Warstwa A.
Wymusz workflow Dark Factory:
Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Do testow uzyj factory/prompts/tester.md.
Do review uzyj factory/prompts/reviewer.md (przekaz TEST_REPORT).
Warstwe B/C doladuj tylko gdy task tego wymaga.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens.
Po 3 nieudanych iteracjach eskaluj do czlowieka.
```
