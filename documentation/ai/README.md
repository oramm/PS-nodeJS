# AI Documentation Model

## Canonical + adapters

1. Canonical project knowledge lives in `documentation/team/*`:
   - `documentation/team/architecture/` — Clean Architecture rules, conventions, system map
   - `documentation/team/onboarding/` — environment, local setup, secrets
   - `documentation/team/runbooks/` — testing, dev-login
   - `documentation/team/operations/` — DB changes, deployment, feature progress
2. Tool-specific instruction files are adapters only:
   - `.github/instructions/*` (Copilot) — sync copies or redirect stubs
   - `CLAUDE.md`, `AGENTS.md`, `.claude/*` — condensed rules + links to canonical
3. Factory meta-tools live in `factory/` (prompts, session adapters, concept)
4. Canonical S.O.T. map lives in `documentation/team/operations/docs-map.md`.
5. Adapters should link to canonical files and avoid content duplication.

## Tool map

- Copilot:
  reads `.github/instructions/*` — `architektura.instructions.md` is a sync copy of `documentation/team/architecture/clean-architecture.md`; others are redirect stubs.
- Claude/agents:
  read `CLAUDE.md` (condensed) + `AGENTS.md`; full rules in `documentation/team/architecture/`.

## Minimal workflow for sub-agents

1. Read relevant canonical file in `documentation/team/*`.
2. Read adapter instruction file used by the current tool.
3. Apply changes.
4. If DB/env/deploy impact exists, update:
   `documentation/team/operations/post-change-checklist.md`.

## Persons V2 Refactor (AI session contract)

For clean-context implementation sessions, use canonical docs:

1. `documentation/team/operations/persons-v2-refactor/plan.md`
2. `documentation/team/operations/persons-v2-refactor/progress.md`

LLM must automatically append progress entry at end of each session and update phase snapshot when a checkpoint is closed.
