# Prompty na kolejne sesje fabryki

## Quick Start - one-linery (copy/paste)

### Codex

```text
Pracuj wg AGENTS.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Rola: Asystent Orkiestratora (NIE implementuj kodu bezposrednio).
Koordynacje i Integrator Gate prowadz wg factory/prompts/orchestrator-assistant.md.
Implementacje shardow prowadz przez factory/prompts/coder.md.
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Workflow: Plan -> Sharding -> Implementacja per shard -> Test -> Review -> Integrator Gate -> Docs -> Commit.
Krok 0: wykonaj pre-session context budget check przed pelnym ladowaniem plikow.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
documentation_layers i documentation_selection_justification.
Nie koncz taska bez APPROVE.
Commit wykonaj przez factory/prompts/committer.md dopiero po COMMIT_APPROVED.
```

### Claude Code

```text
Pracuj wg CLAUDE.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Rola: Asystent Orkiestratora (NIE implementuj kodu bezposrednio).
Koordynacje i Integrator Gate prowadz wg factory/prompts/orchestrator-assistant.md.
Implementacje shardow prowadz przez factory/prompts/coder.md.
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Workflow: Plan -> Sharding -> Implementacja per shard -> Test -> Review -> Integrator Gate -> Docs -> Commit.
Krok 0: wykonaj pre-session context budget check przed pelnym ladowaniem plikow.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
documentation_layers i documentation_selection_justification.
Po 3 nieudanych iteracjach eskaluj do czlowieka.
Commit wykonaj przez factory/prompts/committer.md dopiero po COMMIT_APPROVED.
```

### Copilot VS Code

```text
Pracuj wg .github/copilot-instructions.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Rola: Asystent Orkiestratora (NIE implementuj kodu bezposrednio).
Koordynacje i Integrator Gate prowadz wg factory/prompts/orchestrator-assistant.md.
Implementacje shardow prowadz przez factory/prompts/coder.md.
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Workflow: Plan -> Sharding -> Implementacja per shard -> Test -> Review -> Integrator Gate -> Docs -> Commit.
Krok 0: wykonaj pre-session context budget check przed pelnym ladowaniem plikow.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
documentation_layers i documentation_selection_justification.
Nie zamykaj taska bez APPROVE.
Commit wykonaj przez factory/prompts/committer.md dopiero po COMMIT_APPROVED.
```

---

## Pilot Low-Context First (2-3 sesje)

Checklist pilota:
- [ ] Kazdy task wybiera tylko potrzebne warstwy dokumentacji.
- [ ] Dla backendu model 3-warstwowy jest stosowany konsekwentnie.
- [ ] Dla klienta model 2-warstwowy jest stosowany konsekwentnie.
- [ ] Dla frontend/cross-repo kontrakt API jest weryfikowany po stronie backendu.
- [ ] Uzupelnione pola: required_context_files, optional_context_files, context_budget_tokens, documentation_layers, documentation_selection_justification.

Metryki do zebrania:
- liczba iteracji review na task,
- liczba eskalacji na sesje,
- czas taska,
- liczba doladowanych dokumentow.

Decyzja po pilocie:
- jesli metryki sa stabilne, rozwaz automatyzacje hookami;
- jesli nie, kalibruj budzet kontekstu i zasady selekcji warstw.

## Protokol v1.1: Context Rollover

Reguly:
- Pre-session check (Krok 0): oszacuj, czy `required_context_files` miesci sie w planowanym budzecie.
- Runtime trigger: przerwij sesje gdy `remaining_context_capacity <= 40%`.
- Trigger dodatkowy: przerwij, gdy scope planu zostal naruszony (liczba plikow lub zakres shardu).

Obowiazkowe artefakty handoff:
- status snapshot,
- update `*-progress.md`,
- wpis `*-activity-log.md`,
- gotowy prompt kolejnej sesji.

## Protokol v1.1: Eskalacja po 3x fail

Po 3 nieudanych iteracjach (`TEST_FAIL` albo `REQUEST_CHANGES`) asystent:
1. Ustawia status `ESCALATION_REQUIRED`.
2. Zatrzymuje shard/sesje.
3. Publikuje `ESCALATION_REPORT`:

```text
ESCALATION_REPORT:
  shard_id: "<id>"
  attempts_summary:
    - "attempt 1: ..."
    - "attempt 2: ..."
    - "attempt 3: ..."
  root_cause_hypothesis: "..."
  options:
    - option: "A"
      risk: "..."
    - option: "B"
      risk: "..."
  recommended_option: "A|B"
  decision_needed_from_human: "..."
```

4. Czeka na decyzje czlowieka przed kontynuacja.

Owner i kontrakt roli eskalujacej: `factory/prompts/orchestrator-assistant.md`.
Template `ESCALATION_REPORT` w tej sekcji pozostaje S.O.T. procesu.

## Protokol v1.1: Resume fallback

- Domyslnie: wykonuj tylko pierwszy `OPEN` checkpoint.
- Wyjatek: jesli pierwszy `OPEN` jest zablokowany (np. shard conflict), przejdz do `blocked_checkpoint_fallback = escalate_and_wait`.

## Sesja 3: Planner DONE

Podsumowanie:
- `factory/prompts/planner.md` jest S.O.T. dla planowania taska.
- Kontrakt YAML korzysta z `documentation_layers` i `documentation_selection_justification`.
- Pipeline: Plan (Planner) -> Implementacja -> Test -> Review -> Docs -> Commit.
- Human checkpoint: Planner czeka na jawne `PLAN_APPROVED` przed przekazaniem do Codera.
- `PLAN_DEVIATION_REPORT`: Coder moze odrzucic plan przy blokerze; max 2 rundy poprawek.

## Sesja 4: Auto-docs DONE

Podsumowanie:
- `factory/prompts/documentarian.md` domyka docs-sync i close&purge.
- Pipeline ma gate: `TEST_PASS` + `REVIEW_APPROVE` + `DOCS_SYNC_DONE`.

## Sesja 5: Committer DONE

Podsumowanie:
- Dodano `factory/prompts/committer.md`.
- Commit wymaga `COMMIT_REQUEST` + jawnego `COMMIT_APPROVED`.
- V1: orchestrator-czlowiek deklaruje gate'y jakosci w `COMMIT_REQUEST`.
- Bezpieczenstwo stagingu: zakaz `git add .`/`git add -A`; tylko `files_changed` lub staged-only.
- Zakres v1: commit only (bez push/PR).
