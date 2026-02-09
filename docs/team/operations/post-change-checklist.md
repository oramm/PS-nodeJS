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
