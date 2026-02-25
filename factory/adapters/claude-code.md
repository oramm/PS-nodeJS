# Adapter - Claude Code

## Uzycie

1. Na starcie sesji:
    - przeczytaj `CLAUDE.md`,
    - przeczytaj `factory/TOOL-ADAPTERS.md`,
    - wybierz warstwy dokumentacji potrzebne do taska:
      - backend: `Canonical -> Adaptery -> Factory`
      - klient: `Canonical -> Adaptery`
2. Trzymaj workflow:
    - `Plan -> Sharding -> Implementacja per shard -> Test -> Review -> Integrator Gate -> Docs -> Commit`.
    - rola glowna: `Asystent Orkiestratora` (bez bezposredniej implementacji kodu).
    - koordynacja/integracja wg `factory/prompts/orchestrator-assistant.md`, implementacja shardu wg `factory/prompts/coder.md`.
3. Krok 0 (obowiazkowy): wykonaj pre-session context budget check przed pelnym ladowaniem plikow.
3. Po implementacji uruchom testy wg `factory/prompts/tester.md`.
4. Wynik `TEST_REPORT` przekaz do review wg `factory/prompts/reviewer.md`.
5. Po udanym review (`APPROVE`), zaktualizuj dokumentacje wg `factory/prompts/documentarian.md` i przekaz `operations_feature_slug` + `operations_docs_path` z planu.
6. Przygotuj `COMMIT_REQUEST` (V1: orchestrator-czlowiek).
   - przekaz `ai_lead_model` (model prowadzacy glowny watek) oraz opcjonalnie `ai_coauthor_email`.
7. Commit uruchom przez `factory/prompts/committer.md` tylko po `COMMIT_APPROVED`.
   - commit musi zawierac `Dark-Factory: yes` oraz trailer `Co-authored-by` dla AI.
8. Gdy 3x z rzedu `REQUEST_CHANGES` lub fail testow -> eskaluj do czlowieka.
9. Przy planie taska uzupelnij:
    - `execution_model` (`orchestrator_v1`)
    - `main_agent_policy.can_edit_code` (`false`)
    - `required_context_files`
    - `optional_context_files`
    - `context_budget_tokens`
    - `parallelization`
    - `integration_gate`
    - `context_rollover`
    - `session_resume_contract`
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

Gdy task jest seed-stage lub ma wysoka niepewnosc:
- uruchom Planner w `DISCOVERY_MODE`,
- najpierw uzyskaj `DISCOVERY_APPROVED`,
- dopiero potem finalny YAML i `PLAN_APPROVED`.

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

## Integrator + rollover (v1.1)

- Integrator = `Asystent Orkiestratora` i nie implementuje kodu.
- Integrator status: `INTEGRATION_READY | INTEGRATION_BLOCKED`.
- Runtime trigger rollover: `remaining_context_capacity <= 40%`.
- Po rolloverze przygotuj 4 artefakty:
  - status snapshot,
  - progress update,
  - activity-log entry,
  - next-session prompt.

## Escalation report (v1.1)

Po 3x fail test/review publikuj:

```text
ESCALATION_REPORT:
  shard_id: "<id>"
  attempts_summary: ["...", "...", "..."]
  root_cause_hypothesis: "..."
  options: [{ option: "A", risk: "..." }, { option: "B", risk: "..." }]
  recommended_option: "A|B"
  decision_needed_from_human: "..."
```

## Prompt startowy (copy/paste)

```text
Pracuj wg CLAUDE.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Wymusz workflow Dark Factory:
Plan -> Sharding -> Implementacja per shard -> Test -> Review loop -> Integrator Gate -> Docs -> Commit.
Rola: Asystent Orkiestratora (NIE implementuj kodu bezposrednio).
Koordynacje i Integrator Gate prowadz wg factory/prompts/orchestrator-assistant.md.
Implementacje shardow deleguj wg factory/prompts/coder.md.
Wykonaj pre-session context budget check przed pelnym ladowaniem plikow.
Do testow uzyj factory/prompts/tester.md.
Do review uzyj factory/prompts/reviewer.md (przekaz TEST_REPORT).
Commit wykonaj przez factory/prompts/committer.md po COMMIT_APPROVED.
W COMMIT_REQUEST przekaz ai_lead_model (i opcjonalnie ai_coauthor_email).
Wymagaj w commit message: Dark-Factory: yes + Co-authored-by dla AI.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
execution_model, main_agent_policy.can_edit_code, parallelization, integration_gate,
context_rollover, session_resume_contract,
documentation_layers, documentation_selection_justification,
operations_feature_slug i operations_docs_path.
Po 3 nieudanych iteracjach eskaluj do czlowieka.
```
