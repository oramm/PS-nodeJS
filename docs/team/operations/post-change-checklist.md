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

## 2026-02-15 - Contract Meeting Notes N2 data layer bootstrap

### 1. Scope

- Added backend data-layer scaffold for Contract Meeting Notes:
    - `ContractMeetingNote` model (metadata only),
    - `ContractMeetingNoteRepository` (`find` via OR groups + SQL mapping),
    - `ContractMeetingNotesController` (transaction-safe per-contract sequence allocation in Controller).
- Added initial SQL migration for dedicated metadata table:
    - `src/contractMeetingNotes/migrations/001_create_contract_meeting_notes.sql`.

### 2. DB impact

- Schema change introduced:
    - new table `ContractMeetingNotes` with FK to `Contracts` and optional FK to `Persons`.
    - unique key `(ContractId, SequenceNumber)` to enforce per-contract sequence uniqueness.
    - indexes for metadata search (`ContractId`, `MeetingDate`, `ProtocolGdId`, `CreatedByPersonId`).
- Runtime write strategy for numbering:
    - next sequence is allocated in Controller transaction with `SELECT COALESCE(MAX(...))+1 ... FOR UPDATE`.

### 3. ENV impact

- `.env.example`: not needed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: not required.
- Restart/release steps:
    - apply SQL migration before enabling create/list endpoints for meeting notes.

### 5. Developer actions

- Execute migration in target DB environment.
- Run TypeScript build verification after merge.

### 6. Verification

- `yarn build` (or `npx tsc --noEmit`) should pass with new module files.
- Verify SQL object presence:
    - `ContractMeetingNotes` table exists,
    - unique key `(ContractId, SequenceNumber)` exists.

### 7. Rollback

- Drop `ContractMeetingNotes` table (after confirming no required data retention).
- Revert module files under `src/contractMeetingNotes/*`.

### 8. Owner

- Contract Meeting Notes backend session (Codex + repository owner).

## 2026-02-15 - Contract Meeting Notes N3 create endpoint flow

### 1. Scope

- Added backend create endpoint flow for contract meeting notes:
    - `POST /contractMeetingNote` router,
    - payload validator,
    - controller orchestration with Google Docs template copy and DB transaction.
- Added create-context repository methods for contract folder metadata and persisted folder id back to `Contracts.MeetingProtocolsGdFolderId` when missing.

### 2. DB impact

- No schema changes.
- Runtime data writes added/extended:
    - insert into `ContractMeetingNotes`,
    - optional update of `Contracts.MeetingProtocolsGdFolderId` during first create for contract without pre-existing folder id.
- Transaction scope remains in Controller (`ToolsDb.transaction`).

### 3. ENV impact

- `.env.example`: not needed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: no new vars required.
- Restart/release steps:
    - standard backend deploy,
    - verify OAuth runtime credentials allow GD template copy.

### 5. Developer actions

- Run TypeScript build check.
- Execute API smoke test for `POST /contractMeetingNote` against environment with valid OAuth and existing contract.

### 6. Verification

- `yarn build` passes.
- `POST /contractMeetingNote` should:
    - allocate next sequence per contract,
    - copy template doc,
    - persist metadata with returned `protocolGdId`.

### 7. Rollback

- Revert N3 commit(s) to disable create route and create-flow controller logic.
- If needed, manually remove mistakenly created note rows and GD docs from failed rollout window.

### 8. Owner

- Contract Meeting Notes backend session (Codex + repository owner).

## 2026-02-15 - Contract Meeting Notes correction gate (DB apply pending)

### 1. Scope

- Corrected operational state after documentation alignment sessions (`S1..S4`).
- Locked explicit rollout gate for Contract Meeting Notes before N4/N5 implementation/activation.

### 2. DB impact

- Schema file exists but migration execution is pending:
    - `src/contractMeetingNotes/migrations/001_create_contract_meeting_notes.sql` is **not applied yet** in runtime DB.
- No additional schema files were added in this correction entry.

### 3. ENV impact

- `.env.example`: not needed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: no new vars required.
- Restart/release steps:
    - do not proceed with N4/N5 rollout steps until migration `001` is applied and verified.

### 5. Developer actions

- Apply `001_create_contract_meeting_notes.sql` in target DB environment.
- Verify:
    - `ContractMeetingNotes` table exists,
    - unique key `(ContractId, SequenceNumber)` exists,
    - required indexes/FKs exist.
- After DB verification, continue next code checkpoint (`N4-BACKEND-READ-ENDPOINTS`).

### 6. Verification

- Store execution evidence in progress/activity logs for the next session:
    - migration command/result,
    - schema verification queries/results.

### 7. Rollback

- If migration causes issues:
    - stop N4/N5 rollout,
    - rollback DB change according to controlled DBA procedure,
    - keep feature endpoints disabled until corrected migration is verified.

### 8. Owner

- Contract Meeting Notes backend session (Codex + repository owner).

## 2026-02-15 - Contract Meeting Notes N4 read endpoints + meetingId alignment

### 1. Scope

- Added read/list endpoint for meeting notes:
    - `POST /contractMeetingNotes` with request contract `body.orConditions`.
- Added read payload validator and repository filter coverage for:
    - `contractId`,
    - `meetingId`.
- Aligned backend contracts with plan direction (`ContractMeetingNotes -> Meetings`):
    - `meetingId` field in model/search types/repository mapping.
- Updated pending migration file before first runtime apply:
    - `src/contractMeetingNotes/migrations/001_create_contract_meeting_notes.sql` now includes:
        - nullable `MeetingId`,
        - index `idx_contractmeetingnotes_meetingid`,
        - FK `MeetingId -> Meetings(Id)`.

### 2. DB impact

- Schema definition changed in migration file `001` (not applied yet in runtime DB).
- Runtime verification result in development target:
    - `ContractMeetingNotes` table does not exist (`tableExists=false`).
- DB apply gate remains OPEN until migration is executed and verified.

### 3. ENV impact

- `.env.example`: not needed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: no new vars required.
- Restart/release steps:
    - apply migration `001` before exposing read/create endpoints in production rollout.

### 5. Developer actions

- Execute migration in target DB:
    - `src/contractMeetingNotes/migrations/001_create_contract_meeting_notes.sql`.
- Verify schema after apply:
    - table `ContractMeetingNotes` exists,
    - unique key `(ContractId, SequenceNumber)` exists,
    - `MeetingId` index exists,
    - FK `MeetingId -> Meetings(Id)` exists.
- Run compile/tests:
    - `yarn build`,
    - `yarn jest src/contractMeetingNotes/__tests__/ContractMeetingNotesRouters.test.ts src/contractMeetingNotes/__tests__/ContractMeetingNoteRepository.test.ts --runInBand`.

### 6. Verification

- DB gate evidence command:
    - `npx ts-node tmp/verify-contract-meeting-notes-migration.ts` -> `tableExists=false` on `localhost/envikons_myEnvi`.
- Build/test evidence:
    - `yarn build` -> pass.
    - targeted jest command above -> pass (2 suites, 4 tests).

### 7. Rollback

- If migration apply fails:
    - stop rollout and keep feature endpoints disabled,
    - fix SQL migration and re-run controlled apply,
    - do not proceed to frontend activation until DB verification passes.
- If code rollback needed:
    - revert N4 endpoint + meetingId alignment commit(s) while keeping DB plan documentation.

### 8. Owner

- Contract Meeting Notes backend session (Codex + repository owner).

## 2026-02-12 - Persons V2 P4-C remove dual-write compatibility layer

### 1. Scope

- Removed remaining dual-write compatibility-layer artifacts related to `PERSONS_MODEL_V2_WRITE_DUAL`.
- Deleted `isV2WriteDualEnabled()` from `PersonRepository`.
- Simplified Sessions migration integration test matrix by removing obsolete dual-write branch case.
- Removed `PERSONS_MODEL_V2_WRITE_DUAL` from `.env.example`.

### 2. DB impact

- No schema changes.
- Runtime write behavior remains aligned with previous deprecation steps:
    - account writes continue through `PersonAccounts`,
    - no dual-write fallback/toggle path remains.

### 3. ENV impact

- `.env.example`: updated.
- New/changed variables:
    - removed `PERSONS_MODEL_V2_WRITE_DUAL`.

### 4. Heroku impact

- Config vars: remove `PERSONS_MODEL_V2_WRITE_DUAL` from environment config (no longer used).
- Restart/release steps:
    - standard backend deploy,
    - verify account update flows still persist through `PersonAccounts`.

### 5. Developer actions

- No migration/install actions required.
- Run targeted integration tests and TypeScript check before release.

### 6. Verification

- `yarn jest src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` passes.
- `yarn jest src/persons/__tests__/PersonsController.p2c.integration.test.ts --runInBand` passes.
- `yarn tsc --noEmit` passes.

### 7. Rollback

- Revert P4-C commit and restore `PERSONS_MODEL_V2_WRITE_DUAL` in code/config if temporary dual-write toggle must be reinstated.
- Keep `PERSONS_MODEL_V2_READ_ENABLED=false` if read-side rollback is required independently.

### 8. Owner

- Persons V2 refactor session (Codex + repository owner).

## 2026-02-11 - Persons V2 P4-B remove read fallback

### 1. Scope

- Removed legacy read fallback from Persons v2 read facade methods in `PersonRepository`.
- `findByReadFacade` and `getSystemRoleByReadFacade` now use strict v2 behavior when `PERSONS_MODEL_V2_READ_ENABLED=true`.
- Added focused tests that verify no fallback to legacy path on v2 error/no-row cases.

### 2. DB impact

- No schema changes.
- Runtime read behavior changed for `PERSONS_MODEL_V2_READ_ENABLED=true`:
    - v2 read query errors are no longer redirected to legacy queries,
    - missing v2 `getSystemRole` result no longer triggers legacy fallback.

### 3. ENV impact

- `.env.example`: not changed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: `PERSONS_MODEL_V2_READ_ENABLED` behavior changed (ON now means strict v2 read path).
- Restart/release steps:
    - standard backend deploy.
    - keep `PERSONS_MODEL_V2_READ_ENABLED=false` until v2 read-path readiness is validated in target environment.

### 5. Developer actions

- No migration/install actions required.
- Run targeted P4-B test and TypeScript check before release.

### 6. Verification

- `npx jest src/persons/__tests__/PersonRepository.p4b.read-fallback.test.ts --runInBand` passes.
- `npx tsc --noEmit` passes.

### 7. Rollback

- Revert the P4-B commit to restore v2->legacy read fallback behavior.
- Operational fallback remains possible by keeping `PERSONS_MODEL_V2_READ_ENABLED=false` until re-validation.

### 8. Owner

- Persons V2 refactor session (Codex + repository owner).

## 2026-02-11 - Persons V2 P4-A freeze legacy account-field writes

### 1. Scope

- Frozen legacy account-field writes into `Persons` for active write flows.
- Updated `PersonsController` write methods so account fields are always routed to `PersonAccounts`.
- Removed `ToolsGapi` fallback write to `Persons` for OAuth account updates.
- Updated integration tests to validate frozen legacy write path.

### 2. DB impact

- No schema changes.
- Runtime write behavior changed:
    - account fields (`systemRoleId`, `systemEmail`, OAuth account fields) no longer write to legacy `Persons` columns.
    - account writes are persisted via `PersonAccounts`.

### 3. ENV impact

- `.env.example`: not changed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: existing Persons V2 flags remain, but Sessions account writes are now frozen away from legacy `Persons` path regardless of `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED`.
- Restart/release steps:
    - standard backend deploy.
    - verify login/account update flow writes to `PersonAccounts` in target environment.

### 5. Developer actions

- No migration/install actions required.
- Run targeted integration tests and TypeScript check before release.

### 6. Verification

- `npx jest src/persons/__tests__/PersonsController.p2c.integration.test.ts --runInBand` passes.
- `npx jest src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` passes.
- `npx jest src/persons/__tests__/PersonsController.p2c.integration.test.ts src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` passes.
- `npx tsc --noEmit` passes.

### 7. Rollback

- Revert the P4-A freeze commit to restore previous legacy-write fallback behavior.
- Historical note (valid at P4-A time): read-side compatibility fallback existed then.
- Current state after `P4-B`: when `PERSONS_MODEL_V2_READ_ENABLED=true`, runtime read fallback to legacy is removed.

### 8. Owner

- Persons V2 refactor session (Codex + repository owner).

## 2026-02-10 - Persons V2 P3-B first consumer migration (Sessions OAuth)

### 1. Scope

- Migrated first consumer module (`src/setup/Sessions/ToolsGapi.ts`) to consume Persons V2 account write path in a rollout-safe way.
- Added dedicated rollout gate for Sessions module:
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED`
- Kept legacy behavior and previous dual-write behavior as explicit fallback paths.
- Added consumer-level compatibility tests for flag matrix (legacy, sessions-v2, dual-write).

### 2. DB impact

- No schema changes.
- Runtime account write path for OAuth session updates can target `PersonAccounts` when sessions migration flag is enabled.

### 3. ENV impact

- `.env.example`: updated.
- New/changed variables:
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED` (default `false`)

### 4. Heroku impact

- Config vars: add `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=false` (safe default).
- Restart/release steps:
    - Deploy with `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=false` to preserve legacy flow.
    - Enable `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=true` in controlled rollout for Sessions/OAuth consumer only.

### 5. Developer actions

- No migration/install steps required.
- Run targeted test and TypeScript check before enabling the new flag.

### 6. Verification

- `npx jest src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` passes.
- `npx jest src/persons/__tests__/PersonsController.p3a.integration.test.ts src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` passes.
- `npx tsc --noEmit` passes.

### 7. Rollback

- Set `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=false`.
- Existing fallback paths remain:
    - legacy `Persons` write path (`WRITE_DUAL=false`),
    - dual-write account path (`WRITE_DUAL=true`).

### 8. Owner

- Persons V2 refactor session (Codex + repository owner).

## 2026-02-10 - Persons V2 P3-A dedicated v2 endpoints

### 1. Scope

- Added dedicated Persons V2 API endpoints for:
    - account (`/v2/persons/:personId/account`)
    - profile (`/v2/persons/:personId/profile`)
    - experiences (`/v2/persons/:personId/profile/experiences`)
- Added controller/repository operations for `PersonAccounts`, `PersonProfiles`, and `PersonProfileExperiences`.
- Kept all legacy person endpoints unchanged for transition compatibility.

### 2. DB impact

- No schema changes.
- Runtime writes/reads can now target existing V2 tables through new dedicated endpoints.

### 3. ENV impact

- `.env.example`: not changed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: unchanged.
- Restart/release steps:
    - Deploy backend with new routes.
    - Keep both legacy and v2 endpoints available during consumer migration.

### 5. Developer actions

- No migration/install steps required.
- Validate endpoint behavior with integration tests and TypeScript build check.

### 6. Verification

- `npx tsc --noEmit` passes.
- `npx jest src/persons/__tests__/PersonsController.p3a.integration.test.ts --runInBand` passes.
- Legacy compatibility regression pack:
    - `npx jest src/persons/__tests__/PersonsController.p2c.integration.test.ts src/persons/__tests__/PersonRepository.p2d.integration.test.ts src/persons/__tests__/PersonsController.p3a.integration.test.ts --runInBand` passes.

### 7. Rollback

- Revert commit introducing `/v2/persons/*` routes and corresponding controller/repository methods.
- Legacy routes are unaffected and remain valid fallback.

### 8. Owner

- Persons V2 refactor session (Codex + repository owner).

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
