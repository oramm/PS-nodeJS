# Post Change Checklist

Use this file for every change that impacts DB, environment variables, or deployment.

## Template

Copy the block below for each change:

```md
## YYYY-MM-DD - <short-title>

### 1. Scope

- <what changed>

### 2. DB impact

- <none | details of schema/data/migration changes>

### 3. ENV impact

- `.env.example`: <updated/not-needed>
- New/changed variables: <list>

### 4. Heroku impact

- Config vars: <required/not-required>
- Restart/release steps: <steps>

### 5. Developer actions

- <e.g. yarn install, migrations, rebuild>

### 6. Verification

- <how to verify locally/prod>

### 7. Rollback

- <rollback steps>

### 8. Owner

- <person/team>
```

## Entries

## 2026-02-10 - Persons V2 P2-A dual-write safety patch (flagged)

### 1. Scope

- Patched dual-write account sync in `PersonRepository.upsertPersonAccountInDb`.
- Removed `ON DUPLICATE KEY UPDATE` path and switched to explicit upsert-by-`PersonId` (`SELECT` + `UPDATE/INSERT`).
- Added selective sync in `PersonsController.edit` so only account fields present in `fieldsToUpdate` are mirrored to `PersonAccounts`.

### 2. DB impact

- No schema changes.
- Runtime write behavior changed when `PERSONS_MODEL_V2_WRITE_DUAL=true`:
    - duplicate `SystemEmail` conflicts now fail fast by unique constraint (no cross-person overwrite side effect),
    - partial account updates no longer clear unrelated account field.

### 3. ENV impact

- `.env.example`: not changed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: unchanged (`PERSONS_MODEL_V2_WRITE_DUAL`).
- Restart/release steps:
    - Deploy patch with flag OFF (safe default).
    - Validate dual-write scenarios in controlled environment before turning flag ON.

### 5. Developer actions

- No migration/install steps.
- Run TypeScript build check after merge.

### 6. Verification

- `npx tsc --noEmit` passes.
- With `WRITE_DUAL=true` verify manually:
    - edit only `systemRoleId` keeps existing `SystemEmail`,
    - edit only `systemEmail` keeps existing `SystemRoleId`,
    - duplicate `SystemEmail` across persons returns DB conflict error.

### 7. Rollback

- Set `PERSONS_MODEL_V2_WRITE_DUAL=false`.
- If needed, revert this patch commit (no schema/data rollback required).

### 8. Owner

- Persons V2 refactor session (Codex + repository owner).

## 2026-02-10 - Persons V2 P2-A dual-write plumbing (flagged)

### 1. Scope

- Added dual-write plumbing in `PersonsController` write methods (`add`, `edit`, `editUserFromDto`, `addNewSystemUser`).
- When `PERSONS_MODEL_V2_WRITE_DUAL=true`, legacy Persons write + `PersonAccounts` upsert run in a single transaction.
- When `PERSONS_MODEL_V2_WRITE_DUAL=false` (default), behavior is unchanged.
- `delete` unchanged (`PersonAccounts` has `ON DELETE CASCADE`).

### 2. DB impact

- No schema changes (uses existing `PersonAccounts` table from P1-A).
- No data migration needed.
- Runtime writes to `PersonAccounts` only when flag is ON.

### 3. ENV impact

- `.env.example`: not changed (variable already present from P1-C scaffold).
- Existing variable: `PERSONS_MODEL_V2_WRITE_DUAL` (default `false`).

### 4. Heroku impact

- Config vars: `PERSONS_MODEL_V2_WRITE_DUAL` must remain `false` until P2-C/P2-D validation is complete.
- Restart/release steps:
    - Deploy with flag OFF (safe default).
    - Enable (`true`) only after write-path validation in controlled window.

### 5. Developer actions

- No migration or install steps needed.
- Verify build passes after merge.

### 6. Verification

- With `WRITE_DUAL=false`: all write paths use legacy-only flow (no `PersonAccounts` writes).
- With `WRITE_DUAL=true`: write operations with account fields (`systemRoleId`/`systemEmail`) also upsert into `PersonAccounts` within the same transaction.

### 7. Rollback

- Set `PERSONS_MODEL_V2_WRITE_DUAL=false`.
- No DB rollback required (upserted rows in `PersonAccounts` are harmless and consistent with backfill data).

### 8. Owner

- Persons V2 refactor session (Codex + repository owner).

## 2026-02-09 - Persons V2 P1-C read facade (flagged)

### 1. Scope

- Added Persons read facade methods in repository:
- `findByReadFacade`
- `getSystemRoleByReadFacade`
- `getPersonBySystemEmailByReadFacade`
- Added V2 read path implementations with controlled fallback to legacy path.
- Kept existing public read methods unchanged for upcoming `P1-D` switch.

### 2. DB impact

- None (no schema/data migration changes in this checkpoint).

### 3. ENV impact

- `.env.example`: updated.
- New/changed variables:
- `PERSONS_MODEL_V2_READ_ENABLED` (default `false`)
- `PERSONS_MODEL_V2_WRITE_DUAL` (default `false`, scaffold kept for upcoming dual-write phase)

### 4. Heroku impact

- Config vars: required before enabling V2 read path.
- Restart/release steps:
- Set `PERSONS_MODEL_V2_READ_ENABLED=false` for safe default rollout.
- Enable (`true`) only in controlled verification window.

### 5. Developer actions

- No migration execution needed.
- Run build/tests and parity checks before enabling read flag in shared environments.

### 6. Verification

- With `PERSONS_MODEL_V2_READ_ENABLED=false`: facade uses legacy SQL path.
- With `PERSONS_MODEL_V2_READ_ENABLED=true`: facade uses V2 joins with fallback to legacy on error/no row for role lookup.

### 7. Rollback

- Set `PERSONS_MODEL_V2_READ_ENABLED=false`.
- No DB rollback required.

### 8. Owner

- Persons V2 refactor session (Codex + repository owner).

## 2026-02-09 - Persons V2 P1-A schema only

### 1. Scope

- Added SQL migration for Persons V2 schema objects:
- `PersonAccounts`
- `PersonProfiles`
- `PersonProfileExperiences`
- `PersonProfileEducations` (skeleton)
- `PersonProfileSkills` (skeleton)
- `SkillsDictionary` (skeleton)

### 2. DB impact

- Schema only.
- New file: `src/persons/migrations/001_create_persons_v2_schema.sql`.
- No data backfill executed.
- No runtime read/write code changes.

### 3. ENV impact

- `.env.example`: not changed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: not required for this checkpoint.
- Restart/release steps:
- Apply migration in controlled release process.

### 5. Developer actions

- Reviewed and approved SQL migration in branch `persons-v2`.
- Executed migration locally (`NODE_ENV=development`).

### 6. Verification

- Validate table presence and constraints in `information_schema` after migration:
- tables, columns, indexes, key_column_usage, referential_constraints.
- Local verification result (`localhost/envikons_myEnvi`):
- 6 tables found,
- 7 foreign keys found,
- 13 unique indexes found,
- 21 indexes total.

### 7. Rollback

- Drop newly created V2 tables in reverse dependency order:
- `PersonProfileSkills`
- `PersonProfileEducations`
- `PersonProfileExperiences`
- `SkillsDictionary`
- `PersonProfiles`
- `PersonAccounts`

### 8. Owner

- Persons V2 refactor session (Codex + repository owner).

## 2026-02-08 - Team docs canonical model rollout

### 1. Scope

- Introduced canonical operational docs under `docs/team/*`.
- Added tool adapters (`AGENTS.md`, `.github/instructions`, PR template).

### 2. DB impact

- None.

### 3. ENV impact

- `.env.example`: not changed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: not required.
- Restart/release steps: none.

### 5. Developer actions

- Use `docs/team/*` as canonical source for operational documentation.

### 6. Verification

- Check references and links from root stubs and tool adapter files.

### 7. Rollback

- Revert commit containing docs migration.

### 8. Owner

- Platform/docs maintainers.
