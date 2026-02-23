# DB Migration Execution (Local + Remote)

## Purpose

Execute SQL migrations safely on the correct DB target (`development` local or `production` remote), with pre-checks, post-checks, and operations log update.

## Canonical policy links

- `documentation/team/operations/db-changes.md`
- `documentation/team/operations/post-change-checklist.md`

## Required input from operator

1. Migration file(s), for example `src/persons/migrations/006_experience_update_hard_cut.sql`.
2. Target: `local` (`NODE_ENV=development`) or `remote-kylos` (`NODE_ENV=production`).
3. Confirmation that apply is approved for this target.

## Standard workflow

1. Confirm target env and DB host/name before any apply:
   - `npx ts-node tmp/check-db-env-state.ts` with selected `NODE_ENV`.
2. Verify schema state in `information_schema` (tables/columns/indexes) for migration impact.
3. Resolve migration dependencies and order (for example base table migration before alter migration).
4. Apply only missing migration steps, sequentially.
5. Verify expected objects exist after apply.
6. Update `documentation/team/operations/post-change-checklist.md` with:
   - date,
   - target DB,
   - executed migrations,
   - verification evidence,
   - rollback notes.

## Safety rules

1. Do not apply on ambiguous target; confirm exact `DB_HOST/DB_NAME` first.
2. Treat non-idempotent DDL (`ALTER TABLE ... ADD COLUMN`, `ADD INDEX`, `ADD CONSTRAINT`) as verify-first.
3. For SQL files that can include UTF-8 BOM, strip BOM in runner before execution.
4. Run dependent migrations in order; do not parallelize dependent apply steps.
5. If pre-check indicates missing prerequisite schema, stop and apply prerequisite first.

## Example target selection

- Local:
  - `$env:NODE_ENV='development'`
  - expected: local DB host (for this repo usually `localhost`)
- Remote Kylos:
  - `$env:NODE_ENV='production'`
  - expected: `envi-konsulting.kylos.pl` (when configured in `.env`)

## Evidence expected in final report

1. Effective target (`env`, `dbHost`, `dbName`).
2. Which migrations were already present vs newly applied.
3. Post-apply verification for all required objects.
4. Exact file updated in operations docs.
