# Persons V2 Refactor Plan

## Purpose

Execution plan for staged refactor of `Persons` into:

- `Persons` (identity/contact, FK anchor),
- `PersonAccounts` (optional 1:1 system account),
- `PersonProfiles` (optional 1:1 profile),
- `PersonProfileExperiences` (+ schema skeletons for education/skills).

This file is the source of truth for what to do next in each implementation session.

## Session Contract (clean context workflow)

Every new session must start with:

1. Read this file: `docs/team/operations/persons-v2-refactor-plan.md`.
2. Read current status: `docs/team/operations/persons-v2-refactor-progress.md`.
3. Execute only the first OPEN checkpoint from the phase checkpoint list below.
4. At session end, update progress file with completed work, evidence, and next actions.

LLM must also clearly state what happens next after a checkpoint:

- Explicitly say whether the current checkpoint is DONE or still OPEN.
- Explicitly state the next OPEN checkpoint by ID (or say "WAITING" if blocked).
- If waiting, list the exact required user action or input needed to proceed.
- If done, state the immediate next action in the plan (what will be executed next).

Do not restart analysis from zero if progress file already has validated state.

## Non-Negotiable Rules

1. Keep backward compatibility until explicit deprecation phase.
2. Use feature flags for rollout:

- `PERSONS_MODEL_V2_READ_ENABLED` (default `false`)
- `PERSONS_MODEL_V2_WRITE_DUAL` (default `false`)

3. Keep architecture rules:

- Router -> Controller -> Repository -> Model
- transactions only in Controller
- no DB I/O in Model

4. For DB/env/deploy-impacting PRs:

- update `docs/team/operations/post-change-checklist.md`
- update `.env.example` when env keys change
- complete `.github/PULL_REQUEST_TEMPLATE.md` checklist

5. Run `refactoring-audit` skill after each phase touching CRUD/repository/model mapping.
6. LLM MUST automatically update `docs/team/operations/persons-v2-refactor-progress.md` after every completed session and after every closed phase checkpoint.
7. No session is considered complete until progress entry is written with evidence and next actions.

## Session Granularity Rule

Default unit of work is:

1. One session = one checkpoint.
2. If checkpoint is too large, split it into `-1`, `-2` sub-checkpoints in progress file before implementation.
3. Do not combine multiple OPEN checkpoints in one session unless explicitly requested.

## Phase 0 - Guardrails and Baseline (checkpoints)

### Checkpoints

1. `P0-A` Flags scaffold:

- add V2 flags in config and `.env.example`.

2. `P0-B` Baseline metrics capture:

- total persons,
- persons with account,
- persons with profile,
- legacy read output samples.

3. `P0-C` Verification baseline:

- define repeatable checks for `find`, `getSystemRole`, `getPersonBySystemEmail`.

4. `P0-D` Operations docs sync:

- update `post-change-checklist` when PR has DB/env/deploy impact.

### DoD

1. Flags are present and default OFF.
2. Baseline evidence is saved in progress file.
3. Verification commands/tests are documented and repeatable.

## Phase 1 - Schema + Backfill + Read Facade (checkpoints)

### Checkpoints

1. `P1-A` Schema only:

- `PersonAccounts`
- `PersonProfiles`
- `PersonProfileExperiences`
- skeletons: `PersonProfileEducations`, `PersonProfileSkills`, `SkillsDictionary`

2. `P1-B` Backfill only (idempotent):

- accounts from legacy account fields
- profiles for staff/cooperators + `AchievementsExternal` owners
- experiences 1:1 from `AchievementsExternal`

3. `P1-C` Read facade implementation (flag OFF):

- OFF -> legacy read path
- ON -> v2 read path + controlled fallback

4. `P1-D` Public read methods switched to facade:

- `find`
- `getSystemRole`
- `getPersonBySystemEmail`

5. `P1-E` Read parity and rollback rehearsal:

- compare legacy vs v2 outputs for required methods,
- confirm rollback by `READ_ENABLED=false`.

### DoD

1. With flag OFF: behavior unchanged.
2. With flag ON: legacy fields still available in responses.
3. Evidence includes side-by-side results for required methods.
4. Rollback by toggling read flag OFF is confirmed.

## Phase 2 - Dual Write (checkpoints)

### Checkpoints

1. `P2-A` Dual-write plumbing behind `PERSONS_MODEL_V2_WRITE_DUAL`.
2. `P2-B` Write-path split:

- contact -> `Persons`
- account -> `PersonAccounts`
- profile/experience -> profile tables

3. `P2-C` Endpoint compatibility validation (legacy endpoints still operational).

- partial update validation:
  - updating only `systemRoleId` must not clear `systemEmail` in `PersonAccounts`,
  - updating only `systemEmail` must not clear `systemRoleId` in `PersonAccounts`.

4. `P2-D` Idempotency hardening:

- uniqueness constraints,
- conflict handling,
- duplicate prevention checks.
- unique conflict safety:
  - setting an already used `SystemEmail` must return a controlled error,
  - `SystemEmail` conflict must not modify another person's (`PersonId`) account row.

### DoD

1. Flag OFF = legacy writes only.
2. Flag ON = consistent writes in both paths where required.
3. No duplicate accounts/profiles.
4. Audit report PASS (or tracked FAIL with fixes before merge).
5. Evidence includes at least:

- 1 integration test for partial update (`systemRoleId` only / `systemEmail` only),
- 1 integration test for `SystemEmail` unique conflict without cross-person overwrite.

## Phase 3 - V2 Endpoints and Consumer Migration (checkpoints)

### Checkpoints

1. `P3-A` Add dedicated v2 endpoints (account/profile/experience).
2. `P3-B` Migrate first consumer module.
3. `P3-C` Migrate remaining consumers module-by-module.
4. `P3-D` Transition validation:

- legacy contracts preserved until migration checklist is complete.

### DoD

1. At least one consumer module uses v2 endpoints in production-safe way.
2. Legacy endpoints still functional during transition.

## Phase 4 - Deprecation and Cleanup (checkpoints)

### Checkpoints

1. `P4-A` Freeze legacy account-field writes in `Persons`.
2. `P4-B` Remove read fallback after stabilization.
3. `P4-C` Disable/remove dual-write after full migration.
4. `P4-D` Legacy-column retirement plan and execution in separate high-risk PR.

### DoD

1. All active flows use v2 model.
2. Rollback strategy documented for each removed compatibility layer.

## Required Output Per Session

At the end of every session, update progress file with:

1. Session date and owner.
2. Phase and tasks completed.
3. Evidence (commands, test results, file-level references).
4. Open risks/blockers.
5. Exact next tasks for next clean-context session.

In the final reply, LLM must also include a short "Next step" line:

- "Next step: <Checkpoint ID + short title>" when unblocked.
- "Next step: WAITING on <required user action>" when blocked.

If phase checkpoint is completed in session:

1. Update `Current Status Snapshot` in progress file:

- `Active phase`
- `Last completed phase`
- flags state and overall status

2. Append checkpoint note in session entry:

- `Checkpoint ID: <P0-A|P1-C|...>`
- `Phase checkpoint: CLOSED`.
