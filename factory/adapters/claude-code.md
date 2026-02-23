# Adapter - Claude Code

## Uzycie

1. Na starcie sesji:
    - przeczytaj `CLAUDE.md`,
    - przeczytaj `factory/TOOL-ADAPTERS.md`,
    - wybierz warstwy dokumentacji potrzebne do taska:
      - backend: `Canonical -> Adaptery -> Factory`
      - klient: `Canonical -> Adaptery`
2. Trzymaj workflow:
    - `Plan -> Implementacja -> Test -> Review -> Docs -> Commit`.
3. Po implementacji uruchom testy wg `factory/prompts/tester.md`.
4. Wynik `TEST_REPORT` przekaz do review wg `factory/prompts/reviewer.md`.
5. Po udanym review (`APPROVE`), zaktualizuj dokumentacje wg `factory/prompts/documentarian.md` i przekaz `operations_feature_slug` + `operations_docs_path` z planu.
6. Przygotuj `COMMIT_REQUEST` (V1: orchestrator-czlowiek).
7. Commit uruchom przez `factory/prompts/committer.md` tylko po `COMMIT_APPROVED`.
8. Gdy 3x z rzedu `REQUEST_CHANGES` lub fail testow -> eskaluj do czlowieka.
9. Przy planie taska uzupelnij:
    - `required_context_files`
    - `optional_context_files`
    - `context_budget_tokens`
    - `documentation_layers`
    - `documentation_selection_justification`
    - `operations_feature_slug`
    - `operations_docs_path`

## Planner (Warstwa 3)

### Plan Mode - uruchomienie

Uruchom Plan Mode **przed** eksploracja (bezpieczna eksploracja bez zmian w plikach).

Dwie metody:

- W sesji interaktywnej: **Shift+Tab** dwukrotnie (Normal -> Auto-Accept -> Plan Mode)
- Nowa sesja od razu w Plan Mode:
    ```bash
    claude --permission-mode plan
    ```

> Uwaga: skroty i flagi zaleza od wersji Claude Code - weryfikuj w `/help` aktualnej instalacji.

Po fazie planowania i uzyskaniu `PLAN_APPROVED`:
**otworz nowa sesje bez `--permission-mode plan`** - Coder startuje z czystym kontekstem skupionym na implementacji.

### Subagenty do eksploracji (izolacja kontekstu)

Uzyj Task tool (subagent Explore) do waskiej eksploracji modulow.
Subagent chroni glowny kontekst - czyta pliki i zwraca tylko wnioski, nie pelne pliki.
Zawsze przekazuj subagentowi zasady Dark Factory i wybrane warstwy dokumentacji dla taska.
Zakres subagenta = `context_budget.subagent_scope` z YAML kontraktu.

### Worktrees (opcjonalnie)

Gdy task dotyka >2 modulow lub istnieje ryzyko konfliktu z biezaca praca, uzyj worktree:

```bash
claude --worktree {task-name}
```

Coder pracuje w izolowanym worktree. Merge po `APPROVE`.

### PLAN_DEVIATION_REPORT

Jesli Coder odkryje przeszkode: wraca do Plan Mode (nowa sesja `--permission-mode plan`).
Planner generuje poprawiony kontrakt -> nowy human checkpoint.
Max 2 rundy - po 2 bez rozwiazania -> eskalacja do czlowieka.

## Prompt startowy (copy/paste)

```text
Pracuj wg CLAUDE.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Wymusz workflow Dark Factory:
Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Do testow uzyj factory/prompts/tester.md.
Do review uzyj factory/prompts/reviewer.md (przekaz TEST_REPORT).
Commit wykonaj przez factory/prompts/committer.md po COMMIT_APPROVED.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
documentation_layers, documentation_selection_justification,
operations_feature_slug i operations_docs_path.
Po 3 nieudanych iteracjach eskaluj do czlowieka.
```
