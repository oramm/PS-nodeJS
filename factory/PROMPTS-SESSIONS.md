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

## Task resume: faktury-kosztowe-platnosci

### Kontekst
Sesja z 2026-02-26. Implementacja cross-repo ukończona, poprawki po review zastosowane.
Szczegółowy status: `factory/STATUS.md` sekcja "Task: faktury-kosztowe-platnosci".

### Stan na koniec sesji
- Implementacja: DONE (9 plików zmienionych w 2 repozytoriach)
- Review runda 1: REQUEST_CHANGES (2 HIGH naprawione)
- Review runda 2: DO WYKONANIA
- Commit: PENDING

### Co zrobić w następnej sesji

1. Przeczytaj `factory/STATUS.md` sekcję "faktury-kosztowe-platnosci"
2. Uruchom review subagent (factory/prompts/reviewer.md) na diff obu repozytoriów
3. Przy APPROVE: uruchom Committer dla PS-nodeJS (`git -C /home/user/PS-nodeJS`)
4. Następnie: push ENVI.ProjectSite z `/home/user/ENVI.ProjectSite` na branch `claude/dark-factory-pattern-ohLLZ`

### Pliki do przekazania do review (diff)
**PS-nodeJS** (branch claude/dark-factory-pattern-ohLLZ):
- migrations/002_add_payment_and_bank.sql (NEW)
- migrations/002_add_payment_and_bank_down.sql (NEW)
- CostInvoice.ts
- CostInvoiceRepository.ts
- CostInvoiceValidator.ts (NEW)
- CostInvoicesRouter.ts

**ENVI.ProjectSite** (branch claude/dark-factory-pattern-ohLLZ, lokalizacja /home/user/ENVI.ProjectSite):
- Typings/bussinesTypes.d.ts
- CostInvoicesController.ts
- CostInvoicesBadges.tsx
- CostInvoicesSearch.tsx
- CostInvoiceDetails.tsx
