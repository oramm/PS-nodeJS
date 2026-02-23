# Prompty na kolejne sesje fabryki

## Quick Start - one-linery (copy/paste)

### Codex

```text
Pracuj wg AGENTS.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Workflow: Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
documentation_layers i documentation_selection_justification.
Nie koncz taska bez APPROVE.
```

### Claude Code

```text
Pracuj wg CLAUDE.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Workflow: Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
documentation_layers i documentation_selection_justification.
Po 3 nieudanych iteracjach eskaluj do czlowieka.
```

### Copilot VS Code

```text
Pracuj wg .github/copilot-instructions.md i factory/TOOL-ADAPTERS.md (Low-Context First).
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Workflow: Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
documentation_layers i documentation_selection_justification.
Nie zamykaj taska bez APPROVE.
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

## Sesja 3: Planner DONE

Podsumowanie:
- `factory/prompts/planner.md` jest S.O.T. dla planowania taska.
- Kontrakt YAML korzysta z `documentation_layers` i `documentation_selection_justification`.
- Pipeline: Plan (Planner) -> Implementacja -> Test -> Review -> Docs -> Commit.
- Human checkpoint: Planner czeka na jawne `PLAN_APPROVED` przed przekazaniem do Codera.
- `PLAN_DEVIATION_REPORT`: Coder moze odrzucic plan przy blokerze; max 2 rundy poprawek.

## Sesja 4: Auto-docs

[placeholder]
