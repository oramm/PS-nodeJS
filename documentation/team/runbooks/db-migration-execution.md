# DB Migration Execution (Local + Remote)

## Purpose

Execute SQL migrations safely on the correct DB target (`development` local or `production` remote) with a DB-backed migration registry, pre-checks, and post-check evidence.

## Canonical policy links

- `documentation/team/operations/db-changes.md`
- `documentation/team/operations/post-change-checklist.md`
- `documentation/team/operations/deployment-heroku.md`

## Migration contract

- Executable migrations live only in `src/**/migrations`.
- Executable filenames must match `NNN_name.sql`.
- Rollback helpers `*_down.sql` are ignored by the runner and are never part of `apply`, `verify`, or `baseline`.
- Migration identity is the full repo-relative path, for example `src/invoices/migrations/006_add_invoice_ksef_correction_type.sql`.
- Applied migrations are immutable. Any fix must go through a new migration file.
- Runner order is a stable lexicographic sort by repo-relative path. Cross-module dependencies must be handled consciously by the operator.

## Source of truth

`SchemaMigrations` in each target database is the source of truth for rollout state.

Tracked columns:

- `Id`
- `MigrationName` (unique, not null)
- `Checksum` (not null)
- `AppliedAt` (not null)
- `AppliedBy`
- `GitSha`
- `ExecutionMillis`

The runner writes a row only after successful apply or baseline registration.

## Runner commands

- `yarn migrate:list` - show repo migrations against DB tracking state for current `NODE_ENV`.
- `yarn migrate:verify` - fail on any repo-vs-DB inconsistency, including pending migrations, checksum drift, or DB-only migration records.
- `yarn migrate:apply` - execute only missing migrations and register them in `SchemaMigrations`.
- `yarn migrate:baseline` - register missing historical migrations without executing SQL.

Each command loads env through `src/setup/loadEnv.ts` and logs active `NODE_ENV`, `DB_HOST`, and `DB_NAME`.

## Required input from operator

1. Target: `local` (`NODE_ENV=development`) or `remote-kylos` (`NODE_ENV=production`).
2. Confirmation whether the action is `list`, `verify`, `apply`, or `baseline`.
3. Manual verification that baseline is safe when using `baseline`.

## Standard workflow

1. Confirm target env and DB host/name before any state-changing step:
   - `npx ts-node tmp/check-db-env-state.ts` with selected `NODE_ENV`.
2. Run `yarn migrate:list` and inspect pending/drift output.
3. Verify prerequisite schema in `information_schema` when the migration touches existing tables or indexes.
4. Choose exactly one action:
   - `yarn migrate:verify` for release/pre-release gate checks.
   - `yarn migrate:apply` for new SQL that must execute.
   - `yarn migrate:baseline` only after manual confirmation that historical SQL effects already exist.
5. Re-run `yarn migrate:verify` until it passes.
6. Update `documentation/team/operations/post-change-checklist.md` with target DB, executed or baselined migrations, verification, and rollback notes.

## Baseline rollout sequence

1. Deploy the runner code first.
2. On each environment, manually confirm the current schema matches historical migration intent.
3. Run `yarn migrate:baseline` once for the historical migration set.
4. Run `yarn migrate:verify` and keep the output as rollout evidence.
5. Enable or keep the Heroku `release` verify gate only after the baseline is green.

## Safety rules

1. Do not apply on ambiguous target; confirm exact `DB_HOST/DB_NAME` first.
2. Treat non-idempotent DDL (`ALTER TABLE ... ADD COLUMN`, `ADD INDEX`, `ADD CONSTRAINT`) as verify-first and review prerequisites before apply.
3. The runner strips UTF-8 BOM before checksum/apply.
4. Dependent migrations must run sequentially; do not parallelize cross-module migration execution.
5. If `verify` reports checksum drift, stop. Do not edit an applied migration; add a new file instead.
6. If pre-check indicates missing prerequisite schema, stop and resolve the prerequisite before apply.

## Example target selection

- Local:
  - `$env:NODE_ENV='development'`
  - expected: local DB host (for this repo usually `localhost`)
- Remote Kylos:
  - `$env:NODE_ENV='production'`
  - expected: `envi-konsulting.kylos.pl` (when configured in `.env`)

## Evidence expected in final report

1. Effective target (`env`, `dbHost`, `dbName`).
2. Which migrations are `applied`, `pending`, `drift`, or `baselined`.
3. Post-apply or post-baseline verification summary.
4. Exact file updated in operations docs.
