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

- Active phase: `4`
- Last completed phase: `3`
- Flags state:
- `PERSONS_MODEL_V2_READ_ENABLED`: `false` (default OFF; `P4-B` removed v2->legacy read fallback when flag is ON)
- `PERSONS_MODEL_V2_WRITE_DUAL`: `removed` (`P4-C` dual-write compatibility layer retired)
- `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED`: `false` (retained env key; Sessions OAuth account writes are frozen to `PersonAccounts` in P4-A)
- Overall status: `P4-C_CLOSED`

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

## 2026-02-12 - Session 17 - P4-C disable/remove dual-write after full migration

### 1. Scope

- Phase: 4
- Checkpoint ID: P4-C
- Planned tasks:
    - Remove remaining dual-write compatibility-layer artifacts.
    - Keep scope limited to dual-write retirement without expanding deprecation phase.
    - Produce focused evidence with yarn-based verification.

### 2. Completed

- Removed last production runtime dual-write artifact:
    - deleted `PersonRepository.isV2WriteDualEnabled()` and `PERSONS_MODEL_V2_WRITE_DUAL` env access from runtime `src` code.
- Updated Sessions migration integration test matrix to retire the obsolete `WRITE_DUAL` branch case.
- Removed `PERSONS_MODEL_V2_WRITE_DUAL` from `.env.example` as part of compatibility-layer retirement.

### 3. Evidence

- Commands/checks:
    - `yarn jest src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` -> PASS (2/2 tests).
    - `yarn jest src/persons/__tests__/PersonsController.p2c.integration.test.ts --runInBand` -> PASS (4/4 tests).
    - `yarn tsc --noEmit` -> PASS (no type errors).
    - `rg -n "PERSONS_MODEL_V2_WRITE_DUAL" src/**/*.ts` -> no matches (runtime source cleared of WRITE_DUAL).
- Tests:
    - `ToolsGapi P3-B first consumer migration` -> PASS (2/2; dual-write branch removed from test matrix).
    - `PersonsController P2-C endpoint compatibility` -> PASS (4/4; account writes remain routed via `PersonAccounts`).
- Files changed:
    - `src/persons/PersonRepository.ts`
    - `src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts`
    - `.env.example`
    - `docs/team/operations/post-change-checklist.md`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged in this checkpoint.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL` removed from runtime path and `.env.example` in this checkpoint.
    - account writes continue through `PersonAccounts`; legacy dual-write toggle is no longer available.
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=false`; unchanged behavior in this checkpoint.
- Legacy behavior check result:
    - legacy account-field writes into `Persons` remain frozen (from P4-A), and no dual-write compatibility path remains active.

### 5. Risks/Blockers

- Rollback from this point requires code/config rollback (cannot be toggled by `PERSONS_MODEL_V2_WRITE_DUAL` anymore).

### 6. Next Session (exact next actions)

- Next checkpoint ID: P4-D
- Prepare and execute legacy-column retirement plan in a separate high-risk PR.
- Document explicit rollback strategy for removed compatibility layers in that PR scope.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-11 - Session 16 - P4-B remove read fallback after stabilization

### 1. Scope

- Phase: 4
- Checkpoint ID: P4-B
- Planned tasks:
    - Remove legacy read fallback from Persons v2 read facade.
    - Keep checkpoint scope limited to read-path behavior change.
    - Add focused evidence for fallback removal.

### 2. Completed

- Removed fallback behavior from `PersonRepository.findByReadFacade`:
    - `READ_ENABLED=true` now executes `findV2` directly.
    - query errors in v2 path no longer fallback to legacy `findLegacy`.
- Removed fallback behavior from `PersonRepository.getSystemRoleByReadFacade`:
    - `READ_ENABLED=true` now executes `getSystemRoleV2` directly.
    - no-row and query-error cases no longer fallback to `getSystemRoleLegacy`.
- Added focused regression test file for P4-B fallback removal behavior.

### 3. Evidence

- Commands/checks:
    - `npx jest src/persons/__tests__/PersonRepository.p4b.read-fallback.test.ts --runInBand` -> PASS (2/2 tests).
    - `npx tsc --noEmit` -> PASS (no type errors).
- Tests:
    - `PersonRepository P4-B remove read fallback`:
        - `does not fallback to legacy find path when v2 find fails` -> PASS
        - `does not fallback to legacy getSystemRole path when v2 getSystemRole returns undefined` -> PASS
- Files changed:
    - `src/persons/PersonRepository.ts`
    - `src/persons/__tests__/PersonRepository.p4b.read-fallback.test.ts`
    - `docs/team/operations/post-change-checklist.md`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false` -> legacy read path remains unchanged.
    - `PERSONS_MODEL_V2_READ_ENABLED=true` -> v2 read path is now strict (no legacy fallback).
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false`; unchanged in this checkpoint.
- Legacy behavior check result:
    - Legacy read behavior remains available only with `READ_ENABLED=false`; runtime fallback from v2 to legacy has been removed per deprecation plan.

### 5. Risks/Blockers

- With `READ_ENABLED=true`, v2 read-path errors now propagate directly; operational rollout should ensure monitoring/alerting is in place before enabling in shared environments.

### 6. Next Session (exact next actions)

- Next checkpoint ID: P4-C
- Disable/remove dual-write after full migration.
- Document rollback strategy for dual-write compatibility-layer removal.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-11 - Session 15 - P4-A freeze legacy account-field writes

### 1. Scope

- Phase: 4
- Checkpoint ID: P4-A
- Planned tasks:
    - Freeze legacy account-field writes in `Persons`.
    - Keep write compatibility by routing account writes to `PersonAccounts`.
    - Add checkpoint evidence and rollback notes.

### 2. Completed

- Updated `PersonsController` write paths (`add`, `edit`, `editUserFromDto`, `addNewSystemUser`):
    - account fields are no longer written into `Persons`.
    - account fields are persisted through `upsertPersonAccountInDb` (`PersonAccounts`) even when `PERSONS_MODEL_V2_WRITE_DUAL=false`.
- Updated Sessions consumer path in `ToolsGapi`:
    - removed fallback `ToolsDb.editInDb('Persons', ...)` for OAuth account updates.
    - OAuth account writes now route to `PersonAccounts` only.
- Updated integration tests to validate frozen legacy write behavior.

### 3. Evidence

- Commands/checks:
    - `npx jest src/persons/__tests__/PersonsController.p2c.integration.test.ts --runInBand` -> PASS (4/4 tests).
    - `npx jest src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` -> PASS (3/3 tests).
    - `npx jest src/persons/__tests__/PersonsController.p2c.integration.test.ts src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` -> PASS (7/7 tests).
    - `npx tsc --noEmit` -> PASS (no type errors).
- Tests:
    - `PersonsController P2-C endpoint compatibility`:
        - `freezes legacy account-field writes in Persons when WRITE_DUAL=false` -> PASS
        - `freezes legacy account fields in Persons on addNewSystemUser` -> PASS
    - `ToolsGapi P3-B first consumer migration`:
        - `freezes legacy Persons write path and updates account via PersonAccounts when both flags are OFF` -> PASS
- Files changed:
    - `src/persons/PersonsController.ts`
    - `src/setup/Sessions/ToolsGapi.ts`
    - `src/persons/__tests__/PersonsController.p2c.integration.test.ts`
    - `src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts`
    - `docs/team/operations/post-change-checklist.md`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged in this checkpoint.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false`; account fields are still frozen away from `Persons` and routed to `PersonAccounts`.
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=false`; no longer re-enables legacy `Persons` account writes in Sessions OAuth flow.
- Legacy behavior check result:
    - Legacy endpoints stay operational, but legacy account-field persistence in `Persons` is intentionally disabled (frozen) as planned for deprecation phase.

### 5. Risks/Blockers

- `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED` remains in env surface but no longer controls legacy fallback behavior for OAuth account writes; operational cleanup/deprecation of the flag remains future work.

### 6. Next Session (exact next actions)

- Next checkpoint ID: P4-B
- Remove read fallback after stabilization.
- Prepare explicit rollback notes for fallback removal step.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-10 - Session 14 - P3-D transition validation

### 1. Scope

- Phase: 3
- Checkpoint ID: P3-D
- Planned tasks:
    - Validate transition state where legacy contracts remain preserved while v2 contracts are available.
    - Produce explicit compatibility evidence for both legacy and v2 Persons contracts.
    - Close phase checkpoint with next action prepared for Phase 4.

### 2. Completed

- Added dedicated P3-D contract test for `PersonsRouters` route registration:
    - verifies legacy routes (`/persons`, `/person`, `/person/:id`, `/user/:id`, `/systemUser`) are still registered.
    - verifies dedicated v2 routes (`/v2/persons/:personId/account`, `/v2/persons/:personId/profile`, `/v2/persons/:personId/profile/experiences`) are also registered.
- Executed transition validation suite covering:
    - legacy write compatibility (`P2-C`),
    - dedicated v2 endpoint behavior (`P3-A`),
    - migrated consumer behavior with safe fallback gating (`P3-B`),
    - simultaneous legacy/v2 route exposure (`P3-D`).

### 3. Evidence

- Commands/checks:
    - `npx jest src/persons/__tests__/PersonsRouters.p3d.contract.test.ts --runInBand` -> PASS (1/1 test).
    - `npx jest src/persons/__tests__/PersonsController.p2c.integration.test.ts src/persons/__tests__/PersonsController.p3a.integration.test.ts src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts src/persons/__tests__/PersonsRouters.p3d.contract.test.ts --runInBand` -> PASS (10/10 tests).
    - `npx tsc --noEmit` -> PASS (no type errors).
- Tests:
    - `PersonsRouters P3-D transition validation`:
        - `keeps legacy routes registered while dedicated v2 routes are available` -> PASS
    - `PersonsController P2-C endpoint compatibility` -> PASS (legacy edit compatibility and partial account update behavior).
    - `PersonsController P3-A v2 dedicated endpoints` -> PASS (v2 account/profile/experience contracts).
    - `ToolsGapi P3-B first consumer migration` -> PASS (legacy fallback + v2 gated consumer migration).
- Files changed:
    - `src/persons/__tests__/PersonsRouters.p3d.contract.test.ts`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged in this checkpoint.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false`; unchanged default behavior.
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=false`; default keeps legacy-safe path.
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=true`; migrated Sessions consumer uses v2 account contract.
- Legacy behavior check result:
    - Confirmed: legacy contracts are still preserved while v2 contracts are present and validated.

### 5. Risks/Blockers

- No blocking issue for Phase 3 close.
- Dedicated v2 not-found/conflict HTTP mapping remains generic through global middleware (tracked earlier), but does not block transition validation checkpoint.

### 6. Next Session (exact next actions)

- Next checkpoint ID: P4-A
- Freeze legacy account-field writes in `Persons`.
- Define compatibility guardrails and rollback notes for the first deprecation step.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-10 - Session 13 - P3-C remaining consumer migration validation

### 1. Scope

- Phase: 3
- Checkpoint ID: P3-C
- Planned tasks:
    - Migrate remaining consumer modules to Persons V2 account/profile/experience contracts.
    - Validate module-by-module that no additional runtime consumers still write account/profile data through legacy `Persons` fields.
    - Keep transition compatibility intact while preserving legacy endpoints.

### 2. Completed

- Completed runtime consumer inventory for account/profile write flows:
    - only `src/setup/Sessions/ToolsGapi.ts` performs consumer-level account writes outside `PersonsController`.
    - this module was migrated in `P3-B` with gated v2 account write path.
- Confirmed there are no remaining runtime consumer modules writing account/profile/experience data directly to legacy `Persons` fields beyond the documented gated fallback.
- Re-validated migrated consumer compatibility behavior and Persons V2 endpoint stability through integration tests.

### 3. Evidence

- Commands/checks:
    - `rg -n --hidden --glob '!node_modules/**' "PersonsController\.(add|addFromDto|edit|editFromDto|editUserFromDto|addNewSystemUser)|ToolsDb\.editInDb\('Persons'|upsertPersonAccountInDb\(" src` -> only consumer-level legacy account write found in `src/setup/Sessions/ToolsGapi.ts` (already migrated/gated in P3-B); no additional remaining consumer write modules.
    - `rg -n --hidden --glob '!node_modules/**' "new PersonsController\(|PersonsController\.|SystemRoleService|getSystemRole\(" src | rg -v "__tests__"` -> non-Sessions modules use read-oriented Persons contracts (`find`, `getSystemRole`, `getPersonFromSessionUserData`) and are out of account/profile write migration scope.
    - `npx jest src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` -> PASS (3/3 tests).
    - `npx jest src/persons/__tests__/PersonsController.p3a.integration.test.ts src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` -> PASS (6/6 tests).
    - `npx tsc --noEmit` -> PASS (no type errors).
- Tests:
    - `ToolsGapi P3-B first consumer migration` -> PASS (legacy fallback + v2 gate + dual-write compatibility).
    - `PersonsController P3-A v2 dedicated endpoints` -> PASS (account/profile/experience v2 write paths operational).
- Files changed:
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged in this checkpoint.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false`; unchanged default behavior.
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=false`; default still keeps legacy fallback for migrated Sessions consumer until controlled rollout.
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=true`; Sessions consumer uses v2 account contract (`PersonAccounts`) as validated.
- Legacy behavior check result:
    - Legacy routes and default-flag behavior remain unchanged; v2 contracts stay available for migrated consumers.

### 5. Risks/Blockers

- Full transition completion still depends on `P3-D` contract-level validation and migration checklist sign-off before broader flag enablement.

### 6. Next Session (exact next actions)

- Next checkpoint ID: P3-D
- Execute transition validation checklist:
    - confirm legacy contracts are preserved while migration checklist is completed.
    - document readiness criteria and rollback points for post-migration stabilization.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-10 - Session 12 - P3-B first consumer migration (Sessions OAuth)

### 1. Scope

- Phase: 3
- Checkpoint ID: P3-B
- Planned tasks:
    - Migrate first consumer module to dedicated Persons V2 account write path.
    - Keep transition production-safe with legacy fallback preserved.
    - Add consumer-level contract compatibility validation for rollout.

### 2. Completed

- Migrated first consumer module: `src/setup/Sessions/ToolsGapi.ts`.
- Added sessions-level rollout gate:
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED`
- Implemented routing logic for OAuth account updates:
    - `SESSIONS_ACCOUNT_ENABLED=false` and `WRITE_DUAL=false` -> legacy write to `Persons`.
    - `SESSIONS_ACCOUNT_ENABLED=true` -> v2 account write to `PersonAccounts`.
    - `SESSIONS_ACCOUNT_ENABLED=false` and `WRITE_DUAL=true` -> preserved existing dual-write account path.
- Added P3-B consumer compatibility tests for all three modes above.
- Updated operations docs and `.env.example` for env-impacting rollout key.

### 3. Evidence

- Commands/checks:
    - `npx jest src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` -> PASS (3/3 tests).
    - `npx jest src/persons/__tests__/PersonsController.p3a.integration.test.ts src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts --runInBand` -> PASS (6/6 tests).
    - `npx tsc --noEmit` -> PASS (no type errors).
- Tests:
    - `ToolsGapi P3-B first consumer migration`:
        - `keeps legacy Persons write path when sessions migration flag is OFF and dual-write is OFF` -> PASS
        - `uses v2 account write path when sessions migration flag is ON` -> PASS
        - `preserves existing dual-write path when sessions migration flag is OFF and dual-write is ON` -> PASS
- Files changed:
    - `src/setup/Sessions/ToolsGapi.ts`
    - `src/setup/Sessions/__tests__/ToolsGapi.p3b.integration.test.ts`
    - `.env.example`
    - `docs/team/operations/post-change-checklist.md`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged in this checkpoint.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false`; unchanged default fallback behavior.
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=false`; default keeps legacy OAuth consumer path unchanged.
    - `PERSONS_MODEL_V2_SESSIONS_ACCOUNT_ENABLED=true`; OAuth account updates in Sessions module use v2 `PersonAccounts` path.
- Legacy behavior check result:
    - Verified by test: with both rollout flags OFF, Sessions module still writes through legacy `Persons` path.

### 5. Risks/Blockers

- Sessions rollout to v2 account path is gated by new env var and still requires controlled enablement in shared environments.

### 6. Next Session (exact next actions)

- Next checkpoint ID: P3-C
- Migrate remaining consumer modules to dedicated `/v2/persons/*` endpoints/module contracts.
- Continue module-by-module compatibility validation until transition checklist is complete.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-10 - Session 11 - P3-A dedicated v2 endpoints

### 1. Scope

- Phase: 3
- Checkpoint ID: P3-A
- Planned tasks:
    - Add dedicated Persons V2 endpoints for account/profile/experience operations.
    - Keep legacy endpoints unchanged during transition.
    - Add verification tests for new controller v2 paths.

### 2. Completed

- Added dedicated v2 API routes in `PersonsRouters`:
    - `GET/PUT /v2/persons/:personId/account`
    - `GET/PUT /v2/persons/:personId/profile`
    - `GET/POST/PUT/DELETE /v2/persons/:personId/profile/experiences`
- Added dedicated v2 controller methods in `PersonsController`:
    - account get/upsert handlers for `PersonAccounts`
    - profile get/upsert handlers for `PersonProfiles`
    - experience list/create/update/delete handlers for `PersonProfileExperiences`
- Extended `PersonRepository` with v2 account/profile/experience operations:
    - account read by `PersonId`
    - profile upsert/read by `PersonId`
    - experience list/create/update/delete scoped by `PersonId`
    - profile auto-create helper when creating first experience for person without existing profile row
- Added P3-A integration-style controller tests covering dedicated v2 account/profile/experience write paths.

### 3. Evidence

- Commands/checks:
    - `npx tsc --noEmit` -> PASS (no type errors).
    - `npx jest src/persons/__tests__/PersonsController.p3a.integration.test.ts --runInBand` -> PASS (3/3 tests).
    - `npx jest src/persons/__tests__/PersonsController.p2c.integration.test.ts src/persons/__tests__/PersonRepository.p2d.integration.test.ts src/persons/__tests__/PersonsController.p3a.integration.test.ts --runInBand` -> PASS (9/9 tests).
- Tests:
    - `PersonsController P3-A v2 dedicated endpoints`:
        - `upserts account via dedicated v2 path` -> PASS
        - `upserts profile via dedicated v2 path` -> PASS
        - `creates experience via dedicated v2 path` -> PASS
- Files changed:
    - `src/persons/PersonRepository.ts`
    - `src/persons/PersonsController.ts`
    - `src/persons/PersonsRouters.ts`
    - `src/persons/__tests__/PersonsController.p3a.integration.test.ts`
    - `docs/team/operations/post-change-checklist.md`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged in this checkpoint.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false`; unchanged in this checkpoint.
    - Dedicated `/v2/persons/*` endpoints write/read directly from v2 tables and do not modify legacy endpoint behavior.
- Legacy behavior check result:
    - Existing legacy routes (`/person`, `/persons`, `/user/:id`, `/systemUser`) remain unchanged and operational.

### 5. Risks/Blockers

- Dedicated v2 routes currently return generic 500 via global error middleware for not-found/conflict cases (no explicit 404/409 mapping yet).

### 6. Next Session (exact next actions)

- Next checkpoint ID: P3-B
- Migrate first consumer module to new dedicated `/v2/persons/*` endpoints.
- Add consumer-level validation for contract compatibility during rollout.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-10 - Session 10 - P2-D idempotency hardening

### 1. Scope

- Phase: 2
- Checkpoint ID: P2-D
- Planned tasks:
    - Harden `PersonAccounts` account upsert for uniqueness conflict handling.
    - Add duplicate-prevention checks for `SystemEmail` updates/inserts.
    - Verify `SystemEmail` conflict returns controlled error and does not touch another person's account row.

### 2. Completed

- Added controlled conflict handling in `PersonRepository.upsertPersonAccountInDb`:
    - Introduced pre-write duplicate prevention check for `SystemEmail` against other `PersonId`.
    - Added controlled domain error mapping for `ER_DUP_ENTRY` race-condition fallback.
    - Preserved update targeting by `PersonId` (`UPDATE ... WHERE PersonId = ?`) to avoid cross-person mutation.
- Added P2-D integration-style repository tests:
    - conflict path returns controlled error and performs no write.
    - race-condition duplicate maps to controlled error.
    - safe update path still writes only current person row.

### 3. Evidence

- Commands/checks:
    - `npx jest src/persons/__tests__/PersonRepository.p2d.integration.test.ts --runInBand` -> PASS (3/3 tests).
    - `npx jest src/persons/__tests__/PersonsController.p2c.integration.test.ts src/persons/__tests__/PersonRepository.p2d.integration.test.ts --runInBand` -> PASS (6/6 tests).
    - `npx tsc --noEmit` -> PASS (no type errors).
- Tests:
    - `PersonRepository P2-D idempotency hardening`:
        - `returns controlled error and prevents write when SystemEmail is already used by another person` -> PASS
        - `maps ER_DUP_ENTRY race condition to controlled SystemEmail conflict error` -> PASS
        - `updates account row only by current PersonId when SystemEmail is available` -> PASS
- Files changed:
    - `src/persons/PersonRepository.ts`
    - `src/persons/__tests__/PersonRepository.p2d.integration.test.ts`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged in this checkpoint.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false` -> unchanged legacy write path by default.
    - `PERSONS_MODEL_V2_WRITE_DUAL=true` -> account upsert now performs explicit duplicate-prevention checks and controlled conflict error mapping for `SystemEmail`.
- Legacy behavior check result:
    - Legacy path remains unchanged with default flags.

### 5. Risks/Blockers

- Controlled conflict currently propagates through existing global error middleware as HTTP 500 with deterministic error message (no dedicated 409 mapping yet).

### 6. Next Session (exact next actions)

- Next checkpoint ID: P3-A
- Add dedicated v2 endpoints for account/profile/experience operations.
- Keep legacy endpoint compatibility during consumer migration start.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-10 - Session 9 - P2-C endpoint compatibility validation

### 1. Scope

- Phase: 2
- Checkpoint ID: P2-C
- Planned tasks:
    - Validate legacy endpoint compatibility for person update flow.
    - Validate partial update behavior for account fields:
        - `systemRoleId` only must not clear `systemEmail` in `PersonAccounts`.
        - `systemEmail` only must not clear `systemRoleId` in `PersonAccounts`.

### 2. Completed

- Added integration-level controller compatibility tests for `PersonsController.editFromDto`:
    - Legacy path (`PERSONS_MODEL_V2_WRITE_DUAL=false`) still uses legacy `Persons` update flow.
    - Dual-write path (`PERSONS_MODEL_V2_WRITE_DUAL=true`) with account-only partial update routes to `PersonAccounts` upsert only.
- Verified selective account sync contract during partial updates:
    - `systemRoleId` only -> upsert called with `['systemRoleId']` (no `systemEmail` sync).
    - `systemEmail` only -> upsert called with `['systemEmail']` (no `systemRoleId` sync).

### 3. Evidence

- Commands/checks:
    - `npx jest src/persons/__tests__/PersonsController.p2c.integration.test.ts --runInBand` -> PASS (3/3 tests).
    - `npx tsc --noEmit` -> PASS (no type errors).
- Tests:
    - `PersonsController P2-C endpoint compatibility`:
        - `keeps legacy edit endpoint operational when WRITE_DUAL=false` -> PASS
        - `editing only systemRoleId does not sync/clear systemEmail in PersonAccounts` -> PASS
        - `editing only systemEmail does not sync/clear systemRoleId in PersonAccounts` -> PASS
- Files changed:
    - `src/persons/__tests__/PersonsController.p2c.integration.test.ts`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged in this checkpoint.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false` -> legacy edit endpoint path unchanged and operational.
    - `PERSONS_MODEL_V2_WRITE_DUAL=true` -> account partial updates preserve non-updated account field by selective sync.
- Legacy behavior check result:
    - Confirmed for update endpoint flow under default flag (`WRITE_DUAL=false`).

### 5. Risks/Blockers

- `SystemEmail` unique conflict runtime hardening scenario is still pending (`P2-D`).

### 6. Next Session (exact next actions)

- Next checkpoint ID: P2-D
- Add idempotency hardening and conflict handling assertions around `PersonAccounts` uniqueness.
- Validate that `SystemEmail` conflict never mutates another person's account row.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-10 - Session 8 - P2-B write-path split

### 1. Scope

- Phase: 2
- Checkpoint ID: P2-B
- Planned tasks:
    - Split dual-write paths:
        - contact -> `Persons`
        - account -> `PersonAccounts`
        - profile/experience -> profile tables (scope validation only; no active write endpoint found in current codebase).
    - Keep default `WRITE_DUAL=false` behavior unchanged.

### 2. Completed

- Updated `PersonsController` dual-write flow to split writes by field group:
    - `add()` and `addNewSystemUser()` now write contact payload to `Persons` without account fields, then upsert account data to `PersonAccounts`.
    - `edit()` and `editUserFromDto()` now split `fieldsToUpdate`:
        - contact fields -> `Persons`
        - account fields -> `PersonAccounts`
        - account-only update no longer writes account fields back to `Persons` when `WRITE_DUAL=true`.
- Extended `PersonRepository.upsertPersonAccountInDb` for full account payload sync:
    - added support for `googleId`, `googleRefreshToken`, `microsoftId`, `microsoftRefreshToken`,
    - retained selective field-sync semantics (only explicitly requested fields are changed).
- Added field-splitting helpers in `PersonRepository`:
    - `getPersonsWriteFields()`
    - `getAccountWriteFields()`
    - `hasProfileWriteFields()`
- Switched OAuth account writes in `ToolsGapi`:
    - with `WRITE_DUAL=true` -> account writes go to `PersonAccounts` via repository upsert,
    - with `WRITE_DUAL=false` -> legacy write to `Persons` remains unchanged.

### 3. Evidence

- Commands/checks:
    - `npx tsc --noEmit` -> PASS (no type errors).
- Tests:
    - Runtime/API test suite not run in this checkpoint.
- Files changed:
    - `src/persons/PersonRepository.ts`
    - `src/persons/PersonsController.ts`
    - `src/setup/Sessions/ToolsGapi.ts`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged in this checkpoint.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false` -> unchanged legacy write behavior.
    - `PERSONS_MODEL_V2_WRITE_DUAL=true` -> split write path active:
        - contact writes in `Persons`,
        - account writes in `PersonAccounts` (including OAuth token/id fields).
- Legacy behavior check result:
    - Default flag path unchanged.
    - Dual-write runtime compatibility validation remains pending for P2-C.

### 5. Risks/Blockers

- Current codebase has no active write endpoint for profile/experience payloads in `PersonsController`; profile tables remain untouched by runtime writes in this checkpoint.
- Integration/runtime verification for split dual-write behavior is still pending (P2-C).

### 6. Next Session (exact next actions)

- Next checkpoint ID: P2-C
- Validate endpoint compatibility with legacy endpoints still operational under dual-write split.
- Add integration checks for partial account updates and controlled behavior before enabling `WRITE_DUAL` in shared environments.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-10 - Session 7 - P2-A dual-write safety patch

### 1. Scope

- Phase: 2
- Checkpoint ID: P2-A
- Planned tasks:
    - Remove risk of cross-person overwrite on `PersonAccounts.SystemEmail` unique conflict.
    - Prevent unintended nulling of account fields during partial `edit()` updates.
    - Keep default `WRITE_DUAL=false` behavior unchanged.

### 2. Completed

- Reworked `PersonRepository.upsertPersonAccountInDb` to upsert by `PersonId`:
    - Replaced `INSERT ... ON DUPLICATE KEY UPDATE` with explicit `SELECT by PersonId` then `UPDATE` or `INSERT`.
    - Preserved unique-constraint protection for `SystemEmail` (duplicate email now fails instead of updating another person's row).
- Added selective account-field sync support in `upsertPersonAccountInDb`:
    - New optional parameter `fieldsToSync` (`systemRoleId`, `systemEmail`).
    - Field is updated only when explicitly requested and present on payload (`!== undefined`).
- Updated `PersonsController.edit`:
    - Derives `accountFieldsToSync` from `fieldsToUpdate`.
    - Passes `accountFieldsToSync` into repository upsert to avoid clearing unrelated account field.

### 3. Evidence

- Commands/checks:
    - `npx tsc --noEmit` -> PASS (no type errors).
- Tests:
    - Runtime/API test suite not run in this patch session.
- Files changed:
    - `src/persons/PersonRepository.ts`
    - `src/persons/PersonsController.ts`
    - `docs/team/operations/post-change-checklist.md`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false` -> unchanged legacy-only writes.
    - `PERSONS_MODEL_V2_WRITE_DUAL=true` -> dual-write kept, with safe account sync semantics (no cross-person overwrite, partial-field-safe updates).
- Legacy behavior check result:
    - Default flag path unchanged; patch applies only to dual-write branch.

### 5. Risks/Blockers

- Runtime validation with `WRITE_DUAL=true` is still pending (P2-C compatibility validation remains required before enablement).

### 6. Next Session (exact next actions)

- Next checkpoint ID: P2-B
- Implement write-path split:
    - contact data -> `Persons`
    - account data -> `PersonAccounts`
    - profile/experience -> profile tables
- Add runtime verification scenarios for patched dual-write path before any shared-env flag enablement.

### 7. Phase Checkpoint

- CLOSED

## 2026-02-10 - Session 6 - P2-A dual-write plumbing

### 1. Scope

- Phase: 2
- Checkpoint ID: P2-A
- Planned tasks:
    - Add `isV2WriteDualEnabled()` flag check to `PersonRepository`.
    - Add `upsertPersonAccountInDb()` helper for writing to `PersonAccounts`.
    - Wire dual-write into all `PersonsController` write methods behind `PERSONS_MODEL_V2_WRITE_DUAL` flag.
    - Keep `WRITE_DUAL=false` behavior unchanged as baseline.

### 2. Completed

- Added `isV2WriteDualEnabled()` public method in `PersonRepository` (mirrors `isV2ReadEnabled()` pattern).
- Added `upsertPersonAccountInDb(person, conn)` method in `PersonRepository`:
    - Uses `INSERT ... ON DUPLICATE KEY UPDATE` keyed on `PersonId` unique constraint.
    - Syncs `SystemRoleId` and `SystemEmail` to `PersonAccounts`.
    - Skips gracefully when person has no account-relevant data (`systemRoleId` and `systemEmail` both null).
- Wired dual-write into `PersonsController` write methods:
    - `add()`: when flag ON and person has account data, wraps legacy insert + account upsert in `ToolsDb.transaction()`.
    - `edit()`: when flag ON and `fieldsToUpdate` includes account fields (`systemRoleId`/`systemEmail`), wraps legacy update + account upsert in transaction.
    - `editUserFromDto()`: when flag ON, wraps legacy update + account upsert in transaction (account fields always present in this method).
    - `addNewSystemUser()`: when flag ON, wraps legacy insert + account upsert in transaction.
    - `delete()` / `deleteFromDto()`: no changes needed (`PersonAccounts` has `ON DELETE CASCADE`).
- Added `ToolsDb` import to `PersonsController`.

### 3. Evidence

- Commands/checks:
    - `npx tsc --noEmit` -> PASS (no type errors).
- Tests:
    - Runtime/API test suite not run in this checkpoint (plumbing only, flag remains OFF).
- Files changed:
    - `src/persons/PersonRepository.ts`
    - `src/persons/PersonsController.ts`
    - `docs/team/operations/post-change-checklist.md`
    - `docs/team/operations/persons-v2-refactor-progress.md`

### 4. Compatibility/Flags

- Read flag state and effect:
    - `PERSONS_MODEL_V2_READ_ENABLED=false`; unchanged in this checkpoint.
- Write flag state and effect:
    - `PERSONS_MODEL_V2_WRITE_DUAL=false` -> all write methods execute legacy path only (unchanged behavior).
    - `PERSONS_MODEL_V2_WRITE_DUAL=true` -> write methods wrap legacy write + `PersonAccounts` upsert in single transaction for account-relevant operations.
- Legacy behavior check result:
    - With default flag (`WRITE_DUAL=false`), all code paths are identical to pre-checkpoint behavior.

### 5. Risks/Blockers

- Dual-write plumbing handles only `SystemRoleId` and `SystemEmail` sync to `PersonAccounts`. `GoogleId`/`GoogleRefreshToken`/`MicrosoftId` sync is deferred to P2-B write-path split (these fields are set via OAuth flow, not through current Controller write methods).
- `upsertPersonAccountInDb` uses `ON DUPLICATE KEY UPDATE` which preserves existing `GoogleId`/token columns when updating only `SystemRoleId`/`SystemEmail`.
- No runtime validation with `WRITE_DUAL=true` yet; flag remains OFF in all environments.

### 6. Next Session (exact next actions)

- Next checkpoint ID: P2-B
- Implement write-path split:
    - contact data -> `Persons`
    - account data -> `PersonAccounts`
    - profile/experience -> profile tables
- Extend dual-write to cover profile-related write operations if applicable.

### 7. Phase Checkpoint

- CLOSED

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
