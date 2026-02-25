# Adapter - Copilot VS Code

## Uzycie

Copilot nie prowadzi sam pelnej orkiestracji, wiec prowadz sesje jawnie:

1. Wklej prompt startowy w Copilot Chat.
2. Wybierz tylko potrzebne warstwy dokumentacji:
    - backend: `Canonical -> Adaptery -> Factory`
    - klient: `Canonical -> Adaptery`
3. Dziel prace na male taski i shardy.
4. Rola glowna: `Asystent Orkiestratora` (bez bezposredniej implementacji kodu).
   - koordynacja/integracja wg `factory/prompts/orchestrator-assistant.md`, implementacja shardu wg `factory/prompts/coder.md`.
5. Krok 0 (obowiazkowy): wykonaj pre-session context budget check przed pelnym ladowaniem plikow.
4. Po implementacji uruchom testy wg `factory/prompts/tester.md`.
5. Wynik `TEST_REPORT` przekaz do review wg `factory/prompts/reviewer.md`.
6. Po docs przygotuj `COMMIT_REQUEST` (V1: czlowiek-orchestrator).
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
9. Gdy scope obejmuje frontend, jawnie pracuj na obu repo:
    - `C:\Apache24\htdocs\PS-nodeJS`
    - `C:\Apache24\htdocs\ENVI.ProjectSite`
10. Jesli wyszukiwarka jest ograniczona do workspace, czytaj pliki klienta po sciezkach bezwzglednych.
11. Jesli dostep do repo klienta jest zablokowany, zglos blocker i popros o diff/pliki; nie oznaczaj review jako pelnego.

## Prompt startowy (copy/paste)

```text
Pracuj wg .github/copilot-instructions.md oraz factory/TOOL-ADAPTERS.md (Low-Context First).
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Workflow:
Plan -> Sharding -> Implementacja per shard -> Test -> Review loop -> Integrator Gate -> Docs -> Commit.
Rola: Asystent Orkiestratora (NIE implementuj kodu bezposrednio).
Koordynacje i Integrator Gate prowadz wg factory/prompts/orchestrator-assistant.md.
Implementacje shardow deleguj wg factory/prompts/coder.md.
Wykonaj pre-session context budget check przed pelnym ladowaniem plikow.
Po implementacji uruchom testy wg factory/prompts/tester.md.
Wynik TEST_REPORT przekaz do review wg factory/prompts/reviewer.md.
Commit wykonaj przez factory/prompts/committer.md po COMMIT_APPROVED.
W COMMIT_REQUEST przekaz ai_lead_model (i opcjonalnie ai_coauthor_email).
Wymagaj w commit message: Dark-Factory: yes + Co-authored-by dla AI.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
execution_model, main_agent_policy.can_edit_code, parallelization, integration_gate,
context_rollover, session_resume_contract,
documentation_layers, documentation_selection_justification,
operations_feature_slug i operations_docs_path.
Nie koncz taska bez review APPROVE.
Jesli scope obejmuje frontend, sprawdz takze C:\Apache24\htdocs\ENVI.ProjectSite.
Jesli brak dostepu do ENVI.ProjectSite, zglos to jawnie jako blocker.
```

## Planner (Warstwa 3)

### Plan agent (Copilot Edits - tryb agenta)

Uzyj **Copilot Edits w trybie agenta** do fazy planowania.
`@workspace` indeksuje repozytorium - nie wskazuj plikow recznie, chyba ze sa to krytyczne S.O.T.

**Pinowanie S.O.T. przez `#file` (tylko dla plikow krytycznych):**

- `#file:factory/prompts/planner.md` - zasady Plannera
- `#file:factory/CONCEPT.md` - fundament Dark Factory
- `#file:.github/instructions/architektura.instructions.md` - gdy task dotyka architektury

> Uwaga: `@workspace` indeksuje repo, ale nie zawsze jest pelnym snapshotem. Dla plikow krytycznych (kontrakt API, typy) uzyj `#file` jako gwarancji swiezosci danych.

### Workflow planowania

1. Otworz Copilot Edits (agent mode).
2. Opisz task i dodaj: "Przygotuj plan wg `#file:factory/prompts/planner.md`."
3. Copilot z `@workspace` analizuje i proponuje YAML kontrakt.
4. Ty zatwierdzasz lub odrzucasz plan.
5. Po `PLAN_APPROVED`: **nowa sesja Edits** z YAML kontraktem jako kontekstem startowym.

Gdy task jest seed-stage lub ma wysoka niepewnosc:
1. Wymus `DISCOVERY_MODE` w Plannerze.
2. Najpierw zatwierdz discovery (`DISCOVERY_APPROVED`).
3. Dopiero potem zatwierdz finalny plan (`PLAN_APPROVED`).

### Cross-repo scope

Gdy task obejmuje frontend: jawnie dodaj `#file` z `C:\Apache24\htdocs\ENVI.ProjectSite`
dla kluczowych plikow (typow, komponentow). `@workspace` moze nie indeksowac drugiego repo.

### PLAN_DEVIATION_REPORT

Coder zglasza przez wiadomosc: "PLAN_DEVIATION_REPORT: [opis]".
Wroc do sesji Plan agent z DEVIATION jako kontekstem - popraw kontrakt.
Max 2 rundy. Czlowiek jest ostatecznym arbitrem zmiany scope.

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

## Wzorzec rozmowy na task

1. "Przygotuj plan taska i acceptance criteria."
2. "Zaimplementuj task zgodnie z planem."
3. "Uruchom testy wg factory/prompts/tester.md."
4. "Wykonaj review wg factory/prompts/reviewer.md (przekaz TEST_REPORT) i wypisz issues."
5. "Napraw issues, potem podaj finalny diff."
6. "Zaktualizuj dokumentacje wg factory/prompts/documentarian.md."
7. "Przygotuj COMMIT_REQUEST i wykonaj commit przez factory/prompts/committer.md po COMMIT_APPROVED."
