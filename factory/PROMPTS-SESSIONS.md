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
