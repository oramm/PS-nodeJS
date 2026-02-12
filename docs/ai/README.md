# AI Documentation Model

## Canonical + adapters

1. Canonical operational content lives in `docs/team/*`.
2. Tool-specific instruction files are adapters only:
   - `.github/instructions/*` (Copilot)
   - `AGENTS.md` and related agent files
   - `.claude/*` configuration files
3. Adapters should link to canonical files and avoid content duplication.

## Tool map

- Copilot:
  reads `.github/instructions/*`, which must point to `docs/team/*`.
- Claude/agents:
  read `AGENTS.md` plus tool configs; policies should map to `docs/team/*`.

## Minimal workflow for sub-agents

1. Read relevant canonical file in `docs/team/*`.
2. Read adapter instruction file used by the current tool.
3. Apply changes.
4. If DB/env/deploy impact exists, update:
   `docs/team/operations/post-change-checklist.md`.

## Persons V2 Refactor (AI session contract)

For clean-context implementation sessions, use canonical docs:

1. `docs/team/operations/persons-v2-refactor-plan.md`
2. `docs/team/operations/persons-v2-refactor-progress.md`

LLM must automatically append progress entry at end of each session and update phase snapshot when a checkpoint is closed.
