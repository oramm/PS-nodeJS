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

- Active phase: `2 (ready)`
- Last completed phase: `1`
- Flags state:
- `PERSONS_MODEL_V2_READ_ENABLED`: `false` (default OFF; P1-E parity and rollback rehearsal completed)
- `PERSONS_MODEL_V2_WRITE_DUAL`: `false` (default OFF; unchanged)
- Overall status: `P1-E_CLOSED (PHASE_1_COMPLETE)`

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

## 2026-02-10 - Session 5 - P1-E read parity and rollback rehearsal

### 1. Scope
- Phase: 1
- Checkpoint ID: P1-E
- Planned tasks:
  - Compare legacy vs V2 outputs for:
    - `find`
    - `getSystemRole`
    - `getPersonBySystemEmail`
  - Confirm rollback behavior by switching `PERSONS_MODEL_V2_READ_ENABLED=false`.

### 2. Completed
- Added and executed parity script:
  - `tmp/verify-persons-v2-p1e-read-parity.ts`
- Verified side-by-side outputs for required read methods under:
  - `READ_ENABLED=false` (legacy baseline),
  - `READ_ENABLED=true` (V2 path),
  - rollback to `READ_ENABLED=false`.
- Found and fixed one compatibility mismatch in `getSystemRole` mapping:
  - V2 returned `microsofId: null` while legacy behaved as `undefined`.
  - Updated V2 mapping to keep legacy-compatible shape (`null -> undefined`).

### 3. Evidence
- Commands/checks:
  - `$env:NODE_ENV='development'; npx ts-node tmp/verify-persons-v2-p1e-read-parity.ts` -> PASS:
    - `find(by id)` parity `true`
    - `find(by systemEmail)` parity `true`
    - `getSystemRole` parity `true`
    - `getPersonBySystemEmail` parity `true`
    - rollback (`READ_ENABLED=false`) parity `true` for all checks
  - `npm run build` -> PASS (`tsc` completed successfully).
- Tests:
  - Dedicated checkpoint parity script run successfully (runtime/API full suite not run in this checkpoint).
- Files changed:
  - `src/persons/PersonRepository.ts`
  - `tmp/verify-persons-v2-p1e-read-parity.ts`
  - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags
- Read flag state and effect:
  - `PERSONS_MODEL_V2_READ_ENABLED=false` -> verified legacy output baseline and rollback behavior.
  - `PERSONS_MODEL_V2_READ_ENABLED=true` -> verified parity for required public read methods with legacy-compatible outputs.
- Write flag state and effect:
  - `PERSONS_MODEL_V2_WRITE_DUAL=false`; unchanged in this checkpoint.
- Legacy behavior check result:
  - Confirmed by side-by-side comparisons and rollback rehearsal.

### 5. Risks/Blockers
- Parity evidence is from local environment (`NODE_ENV=development`, local DB target). Stage/prod verification remains operational follow-up outside this checkpoint.

### 6. Next Session (exact next actions)
- Next checkpoint ID: P2-A
- Implement dual-write plumbing behind `PERSONS_MODEL_V2_WRITE_DUAL`.
- Keep `WRITE_DUAL=false` behavior unchanged as baseline and add gated path only.

### 7. Phase Checkpoint
- CLOSED

## 2026-02-10 - Session 4 - P1-D public read methods switched to facade

### 1. Scope
- Phase: 1
- Checkpoint ID: P1-D
- Planned tasks:
  - Switch public read methods to facade:
    - `find`
    - `getSystemRole`
    - `getPersonBySystemEmail`
  - Keep existing contracts/return shapes unchanged.
  - Do not execute parity/rollback rehearsal yet (reserved for P1-E).

### 2. Completed
- Switched public `PersonRepository.find` to route through `findByReadFacade`.
- Switched public `PersonRepository.getSystemRole` to route through `getSystemRoleByReadFacade`.
- Added public `PersonRepository.getPersonBySystemEmail` and routed it through `getPersonBySystemEmailByReadFacade`.
- Updated `PersonsController.getPersonBySystemEmail` to use repository public method directly.
- Kept method contracts unchanged (same inputs/outputs; only routing changed).

### 3. Evidence
- Commands/checks:
  - `npm run build` -> PASS (`tsc` completed successfully).
- Tests:
  - Full runtime/API parity tests not run in this checkpoint (reserved for P1-E).
- Files changed:
  - `src/persons/PersonRepository.ts`
  - `src/persons/PersonsController.ts`
  - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags
- Read flag state and effect:
  - `PERSONS_MODEL_V2_READ_ENABLED=false` -> switched public methods still execute legacy SQL path via facade.
  - `PERSONS_MODEL_V2_READ_ENABLED=true` -> switched public methods execute V2 SQL path with controlled fallback to legacy.
- Write flag state and effect:
  - `PERSONS_MODEL_V2_WRITE_DUAL=false`; no write-path changes in this checkpoint.
- Legacy behavior check result:
  - Expected unchanged behavior with default flags (`READ_ENABLED=false`), because facade routes to legacy path.

### 5. Risks/Blockers
- Output parity between legacy and V2 for switched methods still needs explicit side-by-side verification in P1-E.
- Rollback rehearsal (`READ_ENABLED=false` toggle validation after switch) still pending in P1-E.

### 6. Next Session (exact next actions)
- Next checkpoint ID: P1-E
- Compare legacy vs V2 outputs for:
  - `find`
  - `getSystemRole`
  - `getPersonBySystemEmail`
- Rehearse rollback by toggling `PERSONS_MODEL_V2_READ_ENABLED=false` and confirm behavior.

### 7. Phase Checkpoint
- CLOSED

## 2026-02-09 - Session 3 - P1-C read facade implementation (flag OFF default)

### 1. Scope
- Phase: 1
- Checkpoint ID: P1-C
- Planned tasks:
  - Implement read facade logic with flag gating.
  - `READ_ENABLED=false` -> legacy read path.
  - `READ_ENABLED=true` -> V2 read path with controlled fallback.
  - Keep scope limited to facade implementation (without public method switch from P1-D).

### 2. Completed
- Added read facade methods in `PersonRepository`:
  - `findByReadFacade`
  - `getSystemRoleByReadFacade`
  - `getPersonBySystemEmailByReadFacade`
- Added V2 read SQL paths with controlled fallback to legacy path:
  - `findV2` + fallback to `findLegacy` on query error.
  - `getSystemRoleV2` + fallback to `getSystemRoleLegacy` on query error or missing row.
- Kept existing public repository methods unchanged (`find`, `getSystemRole`) to preserve behavior until explicit P1-D switch.
- Added Persons V2 feature flags to `.env.example` with safe defaults (`false`).
- Updated operations checklist for env/runtime impact.

### 3. Evidence
- Commands/checks:
  - `npm run build` -> PASS (`tsc` completed successfully).
- Tests:
  - Full runtime/API test suite not run in this checkpoint.
- Files changed:
  - `src/persons/PersonRepository.ts`
  - `.env.example`
  - `docs/team/operations/post-change-checklist.md`
  - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags
- Read flag state and effect:
  - `PERSONS_MODEL_V2_READ_ENABLED=false` -> facade methods route to legacy path.
  - `PERSONS_MODEL_V2_READ_ENABLED=true` -> facade methods route to V2 SQL + controlled fallback.
- Write flag state and effect:
  - `PERSONS_MODEL_V2_WRITE_DUAL=false`; no write-path changes in this checkpoint.
- Legacy behavior check result:
  - Unchanged for existing call-sites (public methods still use legacy path until P1-D).

### 5. Risks/Blockers
- Facade is implemented but not yet connected to public methods (`find`, `getSystemRole`, `getPersonBySystemEmail`), so V2 path is not active in current runtime flow yet.
- Parity and rollback rehearsal for switched public methods remains pending for P1-E.

### 6. Next Session (exact next actions)
- Next checkpoint ID: P1-D
- Switch public read methods to facade:
  - `find`
  - `getSystemRole`
  - `getPersonBySystemEmail`
- Keep method contracts unchanged while routing via P1-C facade logic.

### 7. Phase Checkpoint
- CLOSED

## 2026-02-09 - Session 2 - P1-B backfill only (idempotent)

### 1. Scope
- Phase: 1
- Checkpoint ID: P1-B
- Planned tasks:
  - Add idempotent backfill SQL for `PersonAccounts` from legacy account fields in `Persons`.
  - Add idempotent profile backfill for ENVI staff/cooperators + `AchievementsExternal` owners.
  - Add idempotent experiences 1:1 backfill from `AchievementsExternal`.

### 2. Completed
- Added backfill migration SQL:
  - `src/persons/migrations/002_backfill_persons_v2.sql`
- Implemented idempotent upsert logic for:
  - `PersonAccounts` (unique by `PersonId`, with duplicate `SystemEmail` conflict-safe fallback to `NULL`),
  - `PersonProfiles` (distinct target persons from role/owner criteria),
  - `PersonProfileExperiences` (1:1 by `SourceLegacyAchievementExternalId` with upsert updates).
- Confirmed idempotency by re-running backfill twice with unchanged result counts.
- Kept scope strictly to data backfill (no read facade/write-path/controller/repository changes).

### 3. Evidence
- Commands/checks:
  - `node tmp/inspect-persons-v2-p1b-schema.js` -> source schema confirmed:
    - `Persons`: `SystemRoleId`, `SystemEmail`, `GoogleId`, `GoogleRefreshToken`
    - `AchievementsExternal`: `Id`, `RoleName`, `Description`, `StartDate`, `EndDate`, `Employer`, `OwnerId`
    - `SystemRoles`: `ENVI_MANAGER`, `ENVI_EMPLOYEE`, `ENVI_COOPERATOR`, `EXTERNAL_USER`
  - `node tmp/inspect-persons-v2-p1b-counts.js` -> baseline role/owner distribution:
    - role counts: manager `2`, employee `12`, cooperator `34`, external `386`
    - `AchievementsExternal`: `106` rows, `9` distinct owners
  - `$env:NODE_ENV='development'; node tmp/run-persons-v2-p1b-backfill.js` (run #1) -> `{ accounts: 434, profiles: 52, experiences: 106 }`
  - `$env:NODE_ENV='development'; node tmp/run-persons-v2-p1b-backfill.js` (run #2) -> `{ accounts: 434, profiles: 52, experiences: 106 }` (no change; idempotent)
  - `$env:NODE_ENV='development'; node tmp/verify-persons-v2-p1b-backfill.js` -> parity checks:
    - `expectedProfiles=52`, `actualProfiles=52`
    - `expectedExperiences=106`, `actualExperiences=106`
    - `missingExperienceMappings=0`
    - `accountsWithoutPerson=0`
- Tests:
  - Runtime/API tests not run (checkpoint scope: DB backfill only).
- Files changed:
  - `src/persons/migrations/002_backfill_persons_v2.sql`
  - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags
- Read flag state and effect:
  - `PERSONS_MODEL_V2_READ_ENABLED=false`; no read-path changes in this checkpoint.
- Write flag state and effect:
  - `PERSONS_MODEL_V2_WRITE_DUAL=false`; no write-path changes in this checkpoint.
- Legacy behavior check result:
  - Unchanged by design (data backfill only, no runtime switching yet).

### 5. Risks/Blockers
- Backfill execution evidence is local (`localhost/envikons_myEnvi`, `NODE_ENV=development`); stage/prod run still pending.
- Duplicate non-empty legacy `SystemEmail` values are explicitly conflict-safe mapped to `NULL` in `PersonAccounts`; this preserves idempotent migration execution and avoids unique-key failure.

### 6. Next Session (exact next actions)
- Next checkpoint ID: P1-C
- Implement read facade with flag behavior:
  - `READ_ENABLED=false` -> legacy read path.
  - `READ_ENABLED=true` -> V2 read path with controlled fallback.
- Keep public method contracts intact for subsequent P1-D switch (`find`, `getSystemRole`, `getPersonBySystemEmail`).

### 7. Phase Checkpoint
- CLOSED

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
