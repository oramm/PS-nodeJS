# Adapter - Codex

## Uzycie

1. Na starcie sesji:
    - przeczytaj `AGENTS.md`,
    - przeczytaj `factory/TOOL-ADAPTERS.md`,
    - wybierz warstwy dokumentacji potrzebne do taska:
      - backend: `Canonical -> Adaptery -> Factory`
      - klient: `Canonical -> Adaptery`
2. Potwierdz workflow:
    - `Plan -> Implementacja -> Test -> Review -> Docs -> Commit`.
3. Po implementacji uruchom testy wg `factory/prompts/tester.md`.
4. Wynik `TEST_REPORT` przekaz do review wg `factory/prompts/reviewer.md`.
5. Po udanym review (`APPROVE`), zaktualizuj dokumentacje wg `factory/prompts/documentarian.md` i przekaz `operations_feature_slug` + `operations_docs_path` z planu.
6. Przygotuj `COMMIT_REQUEST` (w V1 przygotowuje go czlowiek-orchestrator).
   - przekaz `ai_lead_model` (model prowadzacy glowny watek) oraz opcjonalnie `ai_coauthor_email`.
7. Commit uruchom przez `factory/prompts/committer.md` tylko po `COMMIT_APPROVED`.
   - commit musi zawierac `Dark-Factory: yes` oraz trailer `Co-authored-by` dla AI.
8. Przy planie taska uzupelnij:
    - `required_context_files`
    - `optional_context_files`
    - `context_budget_tokens`
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

## Prompt startowy (copy/paste)

```text
Pracuj wg AGENTS.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Zastosuj workflow Dark Factory:
Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Testy wykonaj wg factory/prompts/tester.md.
Review wykonaj promptem factory/prompts/reviewer.md (przekaz TEST_REPORT).
Commit wykonaj promptem factory/prompts/committer.md i tylko po COMMIT_APPROVED.
W COMMIT_REQUEST przekaz ai_lead_model (i opcjonalnie ai_coauthor_email).
Wymagaj w commit message: Dark-Factory: yes + Co-authored-by dla AI.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
documentation_layers, documentation_selection_justification,
operations_feature_slug i operations_docs_path.
Nie koncz zadania bez APPROVE.
```
