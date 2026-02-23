# Copilot Instructions - Dark Factory Adapter

This repository uses a Dark Factory workflow.

## Canonical references
- `factory/CONCEPT.md`
- `factory/TOOL-ADAPTERS.md`
- `factory/prompts/reviewer.md`
- `factory/prompts/committer.md`
- `documentation/team/operations/docs-map.md`

## Context Gate v1 (Low-Context First)
- Start with Factory layer: `factory/CONCEPT.md`, `factory/TOOL-ADAPTERS.md`, `factory/prompts/reviewer.md`, `factory/prompts/planner.md`
- Load Canonical docs (`documentation/team/architecture/`, `documentation/team/runbooks/`, `documentation/team/operations/`) selectively when task scope requires it.
- Keep task context compact: typically 5-8 files.
- Use soft budget: `context_budget_tokens` 12000-20000.

## Required execution order
1. Plan task and acceptance criteria.
2. Implement changes.
3. Run local tests.
4. Run review loop with reviewer prompt.
5. Update docs if needed.
6. Prepare `COMMIT_REQUEST` and wait for `COMMIT_APPROVED`.
7. Run committer prompt to create commit.

Never skip step 4 (review loop) for source code changes.
Do not run `git add .` or `git add -A`; commit only files listed in `files_changed`.
Always include planning fields:
- `required_context_files`
- `optional_context_files`
- `context_budget_tokens`

## Review loop rules
- Verdict must be `APPROVE` or `REQUEST_CHANGES`.
- Fix all critical/high issues before proceeding.
- Max 3 failed iterations, then escalate to human.

## Cross-repo scope (PS-nodeJS + ENVI.ProjectSite)
- If task/review scope includes frontend, include `C:\Apache24\htdocs\ENVI.ProjectSite` in scope explicitly.
- If your `search` tool is workspace-limited, use direct file reads/commands against absolute paths instead of claiming full-text scan.
- If external path access is blocked, state it explicitly and request frontend diff/files; do not pretend review is complete.
- Final review summary must state what was checked in:
  - `C:\Apache24\htdocs\PS-nodeJS`
  - `C:\Apache24\htdocs\ENVI.ProjectSite` (or explicitly mark as blocked/unavailable)

## Repository policy
- Keep tool-specific instructions thin and mapped to canonical docs.
- Do not duplicate long operational content here.
