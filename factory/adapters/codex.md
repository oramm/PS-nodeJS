# Adapter - Codex

## Uzycie

Szybki start (chat-first): wklej "Prompt startowy (copy/paste)" i od razu opisz task.
Asystent Orkiestratora ma prowadzic gate'y pytaniami z opcjami `1/2/3` (latwy wybor bez pamietania komend).

1. Na starcie sesji:
    - przeczytaj `AGENTS.md`,
    - przeczytaj `factory/TOOL-ADAPTERS.md`,
    - wybierz warstwy dokumentacji potrzebne do taska:
      - backend: `Canonical -> Adaptery -> Factory`
      - klient: `Canonical -> Adaptery`
2. Potwierdz workflow:
    - `Plan -> Sharding -> Implementacja per shard -> Test -> Review -> Integrator Gate -> Docs -> Commit`.
    - rola glowna: `Asystent Orkiestratora` (bez bezposredniej implementacji kodu).
    - koordynacja/integracja wg `factory/prompts/orchestrator-assistant.md`, implementacja shardu wg `factory/prompts/coder.md`.
3. Krok 0 (obowiazkowy): wykonaj pre-session context budget check przed pelnym ladowaniem plikow.
3. Po implementacji uruchom testy wg `factory/prompts/tester.md`.
4. Wynik `TEST_REPORT` przekaz do review wg `factory/prompts/reviewer.md`.
5. Po udanym review (`APPROVE`), zaktualizuj dokumentacje wg `factory/prompts/documentarian.md` i przekaz `operations_feature_slug` + `operations_docs_path` z planu.
6. Przygotuj `COMMIT_REQUEST` (w V1 przygotowuje go czlowiek-orchestrator).
   - przekaz `ai_lead_model` (model prowadzacy glowny watek) oraz opcjonalnie `ai_coauthor_email`.
7. Commit uruchom przez `factory/prompts/committer.md` tylko po `COMMIT_APPROVED`.
   - commit musi zawierac `Dark-Factory: yes` oraz trailer `Co-authored-by` dla AI.
8. Przy planie taska uzupelnij:
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

### Tryby pracy Plannera w Codex

**Interactive (CLI/TUI):**

- Uruchom Codex w trybie interaktywnym.
- Opisz task i zlec: "Wygeneruj plan wg factory/prompts/planner.md. NIE implementuj."
- Codex generuje YAML i wyswietla w CLI z oczekiwaniem na zatwierdzenie.
- Zatwierdz (`PLAN_APPROVED`) lub odrzuc (`PLAN_REJECTED: powod`) bezposrednio w CLI.

Gdy task jest seed-stage lub ma wysoka niepewnosc:
- uruchom `DISCOVERY_MODE` w Plannerze,
- najpierw uzyskaj `DISCOVERY_APPROVED`,
- dopiero potem finalny YAML i `PLAN_APPROVED`.

**Headless - polityka projektowa Dark Factory (Team Policy):**

Rozdzielenie sesji na planowanie i implementacje to **polityka projektowa**, nie ograniczenie techniczne. Cel: pelny audit trail dla CI/CD.

```bash
# Wywolanie 1: tylko planowanie
codex exec "Wygeneruj plan taska X wg factory/prompts/planner.md. Zapisz do factory/plans/{task-id}.yaml. NIE implementuj."

# Po human review: dodaj PLAN_APPROVED: true do YAML

# Wywolanie 2: implementacja (tylko po PLAN_APPROVED: true w pliku)
codex exec "Zaimplementuj task wg factory/plans/{task-id}.yaml (status: PLAN_APPROVED)."
```

Skrot: `codex e "..."` (alias dla `codex exec`).

`AGENTS.md` musi zawierac regule:
"Nie implementuj bez jawnego PLAN_APPROVED od czlowieka lub pola PLAN_APPROVED: true w pliku planu."

### PLAN_DEVIATION_REPORT w headless

Coder dopisuje do pliku planu:

```yaml
plan_deviation:
  discovered: "..."
  proposal: "..."
```

CI/CD wykrywa `plan_deviation` i pauzuje - czlowiek arbiter. Max 2 iteracje poprawki.

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

Kanoniczny prompt startowy dla Codex jest utrzymywany w `factory/PROMPTS-SESSIONS.md` (sekcja `### Codex`).
Wklej prompt z tego pliku na starcie sesji zamiast utrzymywac lokalna kopie w adapterze.
