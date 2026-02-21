---
name: db-migration-runner
description: >
  Safe SQL migration execution for this repository on local or remote DB targets.
  Use when user asks to check/apply migrations and confirm schema state before/after.
  Follow canonical runbook instead of duplicating DB policy text.
---

# db-migration-runner

Use canonical instructions:

- `docs/team/runbooks/db-migration-execution.md`
- `docs/team/operations/db-changes.md`

Mandatory output after execution:

1. Target confirmation (`env`, `dbHost`, `dbName`).
2. Applied vs already-present migration status.
3. Post-check evidence (tables/columns/indexes).
4. Entry added to `docs/team/operations/post-change-checklist.md`.
