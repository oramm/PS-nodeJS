# Persons V2 Refactor Progress

## How to Use

1. Append one entry after each implementation session.
2. Keep entries factual and evidence-based.
3. Never rewrite old entries except to fix factual mistakes.
4. Next session must start by reading this file + plan file.
5. LLM MUST auto-update this file at end of session (mandatory).
6. If a phase checkpoint is completed, LLM MUST update `Current Status Snapshot` in the same commit/session.

Plan reference:
- `docs/team/operations/persons-v2-refactor-plan.md`

## Current Status Snapshot

- Active phase: `1 (in progress)`
- Last completed phase: `NONE`
- Flags state:
- `PERSONS_MODEL_V2_READ_ENABLED`: `false` (unchanged, not used in P1-A)
- `PERSONS_MODEL_V2_WRITE_DUAL`: `false` (unchanged, not used in P1-A)
- Overall status: `P1-A_CLOSED`

## Session Log Template

Copy for each session:

```md
## YYYY-MM-DD - Session <N> - <short title>

### 1. Scope
- Phase: <0|1|2|3|4>
- Checkpoint ID: <P0-A|P1-C|...>
- Planned tasks:
  - <task>

### 2. Completed
- <what was completed>

### 3. Evidence
- Commands/checks:
  - `<command>` -> <key result>
- Tests:
  - `<test command>` -> <pass/fail + summary>
- Files changed:
  - `<path>`

### 4. Compatibility/Flags
- Read flag state and effect:
- Write flag state and effect:
- Legacy behavior check result:

### 5. Risks/Blockers
- <risk or blocker>

### 6. Next Session (exact next actions)
- Next checkpoint ID: <P0-B|P1-D|...>
- <next action 1>
- <next action 2>

### 7. Phase Checkpoint
- <OPEN|CLOSED>
```

## Session Entries

## 2026-02-09 - Session 1 - P1-A schema only

### 1. Scope
- Phase: 1
- Checkpoint ID: P1-A
- Planned tasks:
  - Add schema tables for Persons V2 split.
  - Add required FK/UNIQUE/index constraints for 1:1 account/profile model.
  - Keep change limited to schema only.

### 2. Completed
- Added migration SQL for P1-A schema only:
  - `PersonAccounts`
  - `PersonProfiles`
  - `PersonProfileExperiences`
  - `PersonProfileEducations` (skeleton)
  - `PersonProfileSkills` (skeleton)
  - `SkillsDictionary` (skeleton)
- Added constraints required by plan:
  - `PersonAccounts.PersonId` UNIQUE + FK to `Persons`.
  - `PersonProfiles.PersonId` UNIQUE + FK to `Persons`.
- Added join/filter indexes for account/profile/experience/skill relations.
- Updated post-change operational checklist for DB-impacting session.
- No backfill implementation.
- No read facade changes.
- No controller/repository/model behavior changes.

### 3. Evidence
- Commands/checks:
  - `git branch --show-current` -> `persons-v2`.
  - `git status --short` (before edits) -> clean working tree.
  - `rg -n "CREATE TABLE IF NOT EXISTS" src -g "*.sql"` -> existing SQL migration pattern confirmed.
  - `$env:NODE_ENV='development'; node tmp/run-persons-v2-p1a-migration.js` -> `[MIGRATION] OK on localhost/envikons_myEnvi (env=development)`.
  - `$env:NODE_ENV='development'; node tmp/verify-persons-v2-p1a-schema.js` -> 6 tables found, 7 foreign keys, 13 unique indexes, 21 indexes total.
- Tests:
  - Runtime tests not run (no application runtime code changes in schema-only checkpoint).
- Files changed:
  - `src/persons/migrations/001_create_persons_v2_schema.sql`
  - `docs/team/operations/post-change-checklist.md`
  - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags
- Read flag state and effect:
  - `PERSONS_MODEL_V2_READ_ENABLED=false`; no read-path changes in this checkpoint.
- Write flag state and effect:
  - `PERSONS_MODEL_V2_WRITE_DUAL=false`; no write-path changes in this checkpoint.
- Legacy behavior check result:
  - Unchanged by design (schema-only, no runtime code modifications).

### 5. Risks/Blockers
- Migration executed and validated on local DB only (`localhost/envikons_myEnvi`); stage/prod execution remains pending.
- `SourceLegacyAchievementExternalId` uniqueness in `PersonProfileExperiences` assumes one-to-one mapping from legacy source rows.

### 6. Next Session (exact next actions)
- Next checkpoint ID: P1-B
- Implement idempotent backfill script/SQL for:
  - `PersonAccounts` from legacy account fields.
  - `PersonProfiles` for staff/cooperators and `AchievementsExternal` owners.
  - `PersonProfileExperiences` from `AchievementsExternal`.
- Capture execution evidence (counts + idempotency re-run result).

### 7. Phase Checkpoint
- CLOSED

## 2026-02-09 - Session 0 - Initialization

### 1. Scope
- Phase: 0 (documentation bootstrap)
- Checkpoint ID: P0-INIT
- Planned tasks:
  - Create execution plan file for clean-context sessions.
  - Create progress file for phase-by-phase continuity.

### 2. Completed
- Added plan file:
  - `docs/team/operations/persons-v2-refactor-plan.md`
- Added progress tracking file:
  - `docs/team/operations/persons-v2-refactor-progress.md`

### 3. Evidence
- Files created in repo:
  - `docs/team/operations/persons-v2-refactor-plan.md`
  - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags
- No runtime/code/db changes yet.
- No flags introduced in code yet.

### 5. Risks/Blockers
- None at bootstrap stage.

### 6. Next Session (exact next actions)
- Next checkpoint ID: P0-A
- Implement Phase 0 tasks from plan:
  - add V2 flags to config + `.env.example`,
  - capture baseline metrics and verification samples,
  - prepare first checklist entry if DB/env/deploy-impacting PR is opened.

### 7. Phase Checkpoint
- CLOSED
