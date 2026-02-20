# Copilot Instructions - Dark Factory Adapter

This repository uses a Dark Factory workflow.

## Canonical references
- `factory/CONCEPT.md`
- `factory/TOOL-ADAPTERS.md`
- `factory/prompts/reviewer.md`
- `factory/DOCS-MAP.md`

## Context Gate v1 (Low-Context First)
- Start only with Layer A:
  - `factory/CONCEPT.md`
  - `factory/TOOL-ADAPTERS.md`
  - `factory/prompts/reviewer.md`
- Load Layer B only when task scope requires it.
- Load Layer C only on explicit blocker/missing-detail trigger.
- Keep task context compact: typically 5-8 files.
- Use soft budget: `context_budget_tokens` 12000-20000.

## Required execution order
1. Plan task and acceptance criteria.
2. Implement changes.
3. Run review loop with reviewer prompt.
4. Run local tests.
5. Update docs if needed.
6. Prepare commit summary.

Never skip step 3 (review loop) for source code changes.
Always include planning fields:
- `required_context_files`
- `optional_context_files`
- `context_budget_tokens`

## Review loop rules
- Verdict must be `APPROVE` or `REQUEST_CHANGES`.
- Fix all critical/high issues before proceeding.
- Max 3 failed iterations, then escalate to human.

## Repository policy
- Keep tool-specific instructions thin and mapped to canonical docs.
- Do not duplicate long operational content here.
