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


## 2026-02-20 - Public Profile Submission configurable link recovery cooldown

### 1. Scope

- Replaced hardcoded link recovery cooldown with environment-based configuration in public profile submission flow.
- Kept safe fallback behavior: invalid or missing env value defaults to `60` seconds.

### 2. DB impact

- none.

### 3. ENV impact

- `.env.example`: updated.
- New/changed variables:
    - `PUBLIC_PROFILE_SUBMISSION_LINK_RECOVERY_COOLDOWN_SECONDS`

### 4. Heroku impact

- Config vars: required only if different value than default is needed.
- Restart/release steps:
    - set `PUBLIC_PROFILE_SUBMISSION_LINK_RECOVERY_COOLDOWN_SECONDS` if needed,
    - restart backend process to apply env change.

### 5. Developer actions

- Pull latest code.
- Run `yarn build`.
- Optionally set cooldown to lower value locally for faster manual testing.

### 6. Verification

- `POST /v2/persons/:personId/public-profile-submissions/link` returns `429` when retried before cooldown elapsed.
- After configured cooldown passes, endpoint returns a fresh link response.

### 7. Rollback

- Roll back code changes in:
    - `src/persons/publicProfileSubmission/PublicProfileSubmissionController.ts`
    - `.env.example`
    - `docs/team/operations/post-change-checklist.md`

### 8. Owner

- Public Profile Submission follow-up session (Codex + repository owner).

## 2026-02-20 - Public Profile Submission link resend + last event metadata

### 1. Scope

- Extended internal link-create flow for public profile submission to optionally send link email immediately (`sendNow`) and accept explicit recipient (`recipientEmail`).
- Persisted and exposed last link event metadata in submission payloads (who/when/to whom/status of last action).
- Kept simple process model: no new audit table, only last known event snapshot.

### 2. DB impact

- New schema migration:
    - `src/persons/migrations/005_add_public_profile_submission_last_link_event.sql`
- Altered table:
    - `PublicProfileSubmissions`
- Added columns:
    - `LastLinkRecipientEmail` (`VARCHAR(255) NULL`)
    - `LastLinkEventAt` (`DATETIME NULL`)
    - `LastLinkEventType` (`VARCHAR(32) NULL`)
    - `LastLinkEventByPersonId` (`INT NULL`, FK to `Persons.Id`)
- Added indexes for last link event lookup/by-person.

### 3. ENV impact

- `.env.example`: not needed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: not required.
- Restart/release steps:
    - apply DB migration `005_add_public_profile_submission_last_link_event.sql` before deploying backend code that reads new columns,
    - ensure SMTP config is present for `sendNow` path.

### 5. Developer actions

- Apply migration in target DB environment.
- Run `yarn build`.
- Run targeted verification for persons public-profile-submission endpoints.

### 6. Verification

- Internal endpoint `POST /v2/persons/:personId/public-profile-submissions/link`:
    - with `sendNow=false` still returns generated URL,
    - with `sendNow=true` sends mail to provided/fallback recipient,
    - response includes dispatch status and recipient.
- Internal search/details endpoints expose:
    - `lastLinkRecipientEmail`,
    - `lastLinkEventAt`,
    - `lastLinkEventType`,
    - `lastLinkEventByPersonId`.

### 7. Rollback

- Roll back code changes in:
    - `src/persons/publicProfileSubmission/*`
    - `src/types/types.d.ts`
- DB rollback (if safe):
    - drop FK/indexes and remove `LastLink*` columns from `PublicProfileSubmissions`.

### 8. Owner

- Public Profile Submission follow-up session (Codex + repository owner).

## 2026-02-19 - Public Profile Submission V1 (backend)

### 1. Scope

- Added backend module for public profile submission flow with tokenized link, email verification code, public draft, public analyze-file, submit, and internal per-item review.
- Added internal endpoints for staff: link generation, submission search/detail, item review, optional close.
- Added public endpoints: token resolve, verify request/confirm, draft read/write, analyze-file, submit.

### 2. DB impact

- New schema migration:
    - `src/persons/migrations/004_create_public_profile_submission_v1.sql`
- Added tables:
    - `PublicProfileSubmissionLinks`
    - `PublicProfileSubmissions`
    - `PublicProfileSubmissionItems`
    - `PublicProfileSubmissionVerifyChallenges`
    - `PublicProfileSubmissionSessions`
- Added indexes/constraints for token hash uniqueness, person+status lookups, expiry queries, submission+item status queries.

### 3. ENV impact

- `.env.example`: updated.
- New/changed variables:
    - `PUBLIC_PROFILE_SUBMISSION_BASE_URL`
    - `PUBLIC_PROFILE_SUBMISSION_LINK_TTL_DAYS`
    - `PUBLIC_PROFILE_SUBMISSION_VERIFY_CODE_TTL_MINUTES`
    - `PUBLIC_PROFILE_SUBMISSION_VERIFY_CODE_MAX_ATTEMPTS`
    - `PUBLIC_PROFILE_SUBMISSION_SESSION_TTL_HOURS`

### 4. Heroku impact

- Config vars: set new `PUBLIC_PROFILE_SUBMISSION_*` vars as needed (defaults are in code).
- Restart/release steps:
    - apply DB migration `004_create_public_profile_submission_v1.sql` before enabling frontend flow,
    - ensure SMTP vars are configured for verify email delivery,
    - restart backend dyno/process after env changes.

### 5. Developer actions

- Apply migration in target DB environment.
- Run `yarn build`.
- Run targeted tests:
    - `yarn jest src/persons/publicProfileSubmission/__tests__/PublicProfileSubmissionAuth.test.ts --runInBand`

### 6. Verification

- Contract smoke:
    - internal link create returns token/url/expiresAt,
    - verify-code request sends email and stores challenge,
    - verify-code confirm returns `publicSessionToken`,
    - draft GET/PUT requires bearer token and persists items,
    - analyze-file endpoint returns shape compatible with existing profile import preview,
    - review `ACCEPT/REJECT` updates item status and auto-closes submission when no pending items.
- Build/test:
    - `yarn build` passes,
    - targeted module test passes.

### 7. Rollback

- Revert backend module files under:
    - `src/persons/publicProfileSubmission/*`
    - `src/persons/migrations/004_create_public_profile_submission_v1.sql`
    - `src/index.ts` router registration
    - `.env.example` added vars
    - `src/types/types.d.ts` new DTO/types
- DB rollback (if needed and safe):
    - drop new `PublicProfileSubmission*` tables in dependency order.

### 8. Owner

- Public Profile Submission backend session (Codex + repository owner).

## 2026-02-18 - Persons V2 skills dictionary description + M-C-R alignment

### 1. Scope

- Skills dictionary module aligned to Model-Controller-Repository standard in persons V2.
- Added dedicated domain model `SkillDictionary` and refactored controller/repository to model-centric flow.
- Extended skills API payloads/responses with optional `description`.
- Extended profile skills JOIN mapping to expose `_skill.description`.

### 2. DB impact

- Schema change in persons V2 migrations:
    - `src/persons/migrations/003_add_skillsdictionary_description.sql`
    - `ALTER TABLE SkillsDictionary ADD COLUMN IF NOT EXISTS Description TEXT NULL AFTER NameNormalized;`
- No data backfill required; existing rows keep `Description = NULL`.

### 3. ENV impact

- `.env.example`: not needed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: not required.
- Restart/release steps: apply DB migration before deploying code that writes/reads `Description`.

### 5. Developer actions

- Apply migration `src/persons/migrations/003_add_skillsdictionary_description.sql` in target environment.
- Run targeted tests for skills/profileSkills module after migration.

### 6. Verification

- Confirm column exists:
    - `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_NAME='SkillsDictionary' AND COLUMN_NAME='Description';`
- API checks:
    - `POST /v2/skills` with only `name` returns `description: null`.
    - `POST/PUT` with `description` persists value.
    - whitespace-only `description` is normalized to `null`.
    - profile skills responses include `_skill.description`.

### 7. Rollback

- Rollback code to previous commit.
- Optional DB rollback only if safe for dependent code paths:
    - `ALTER TABLE SkillsDictionary DROP COLUMN Description;`

### 8. Owner

- Persons V2 skills refactor session (Codex + repository owner).

## 2026-02-18 - KSeF FA(3): naprawa SaleDate/DueDate + backfill

### 1. Scope

- Naprawa parsera XML FA(3): `SaleDate` czytane z `Fa.P_6` (+ fallback `FaWiersz[].P_6A`), `DueDate` z `Fa.Platnosc.TerminPlatnosci[].Termin`.
- Ekstrakcja logiki parsowania do `src/costInvoices/costInvoiceXmlHelpers.ts` (testowalne, czyste funkcje).
- Skrypt backfill `src/scripts/backfillSaleAndDueDateFromXml.ts` uzupełniający NULL w istniejących rekordach.

### 2. DB impact

- Dane — backfill uzupełnia `SaleDate` i/lub `DueDate` w `CostInvoices` tam, gdzie są NULL.
- Brak zmian schematu.
- Idempotentny: `WHERE SaleDate IS NULL OR DueDate IS NULL` — ponowne uruchomienie nie nadpisuje uzupełnionych dat.

### 3. ENV impact

- `.env.example`: not needed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: not required.
- Restart/release steps: none (zmiana kodu parsera + jednorazowy backfill).

### 5. Developer actions

- `yarn build` — kompilacja skryptu backfill.
- `node build/scripts/backfillSaleAndDueDateFromXml.js --dry-run` — weryfikacja (log: `updatedSale > 0`, `errors = 0`).
- `node build/scripts/backfillSaleAndDueDateFromXml.js` — faktyczna aktualizacja.

### 6. Verification

- `yarn test src/costInvoices` — 6 testów jednostkowych przechodzi.
- `yarn build` — brak błędów TypeScript.
- Dry-run log: `updatedSale > 0`, `errors = 0`.
- Spot-check: `SELECT Id, SaleDate, DueDate FROM CostInvoices WHERE XmlContent IS NOT NULL LIMIT 10` — daty niepuste.

### 7. Rollback

- Brak (zmiana wyłącznie uzupełnia NULL — nie nadpisuje istniejących dat).
- Cofnięcie parsera: przywróć poprzednie wiersze w `CostInvoiceController.parseInvoiceXml` i usuń import helpera.

### 8. Owner

- KSeF FA(3) fix session (Codex + repository owner).

## 2026-02-17 - OpenAI API key env baseline

### 1. Scope

- Added OpenAI API key variable in primary API env section for upcoming multi-LLM integrations.

### 2. DB impact

- none.

### 3. ENV impact

- `.env.example`: updated.
- New/changed variables:
    - `OPENAI_API_KEY` (base key for OpenAI integration; intended API section for future LLM keys).

### 4. Heroku impact

- Config vars: set `OPENAI_API_KEY` when enabling OpenAI features.
- Restart/release steps: restart application process after config var change.

### 5. Developer actions

- Add `OPENAI_API_KEY` to local `.env` / `.env.development` before running OpenAI-backed features.

### 6. Verification

- Confirm `OPENAI_API_KEY` exists in `.env.example` and active `.env` file.

### 7. Rollback

- Remove `OPENAI_API_KEY` from env files and runtime config vars.

### 8. Owner

- Codex + repository owner.

## 2026-02-17 - Local KSeF production token selection

### 1. Scope

- Added optional local production token selection for KSeF in env loader.
- Added startup log line with KSeF token source (without printing secrets).

### 2. DB impact

- none.

### 3. ENV impact

- `.env.example`: updated.
- New/changed variables:
    - `KSEF_TOKEN_PRODUCTION` (optional token preferred when `KSEF_ENVIRONMENT=production`; loader falls back to `KSEF_TOKEN` only when missing).

### 4. Heroku impact

- Config vars: optional (`KSEF_TOKEN_PRODUCTION` can be set, but not required if `KSEF_TOKEN` is managed directly).
- Restart/release steps: restart application process after env change.

### 5. Developer actions

- Add `KSEF_TOKEN_PRODUCTION` to local `.env.development` if you want quick local switch to production KSeF.
- Keep `KSEF_TOKEN` for test usage.

### 6. Verification

- Start app with `KSEF_ENVIRONMENT=production` and empty `KSEF_TOKEN`.
- Confirm logs include:
    - `[ENV] KSeF environment: production`
    - `[ENV] KSeF token source: KSEF_TOKEN_PRODUCTION`

### 7. Rollback

- Remove `KSEF_TOKEN_PRODUCTION` from env files and rely only on `KSEF_TOKEN`.

### 8. Owner

- Codex + repository owner.

## 2026-02-15 - Kylos runtime migration reconciliation

### 1. Scope

- Verified runtime DB schema state on production target (`envi-konsulting.kylos.pl/envikons_myEnvi`) against all SQL migrations present in repo under:
    - `src/contractMeetingNotes/migrations/*`
    - `src/costInvoices/migrations/*`
    - `src/invoices/migrations/*`
    - `src/invoices/KSeF/migrations/*`
    - `src/persons/migrations/*`
- Applied only missing runtime migrations.

### 2. DB impact

- Runtime schema updated on `kylos`:
    - applied `src/contractMeetingNotes/migrations/001_create_contract_meeting_notes.sql`,
    - applied `src/invoices/migrations/001_add_invoice_correction_columns.sql`.
- Already present (no-op) during reconciliation:
    - `src/costInvoices/migrations/001_create_cost_invoices.sql`,
    - `src/invoices/KSeF/migrations/001_create_invoice_ksef_metadata.sql`,
    - `src/persons/migrations/001_create_persons_v2_schema.sql`.
- Executed idempotent data backfill:
    - `src/persons/migrations/002_backfill_persons_v2.sql`.

### 3. ENV impact

- `.env.example`: not needed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: not required.
- Restart/release steps: none (DB-only reconciliation).

### 5. Developer actions

- Performed schema presence checks (`information_schema.TABLES/COLUMNS`) on production target.
- Executed missing SQL migrations with `multipleStatements` enabled and re-checked target objects.

### 6. Verification

- Verified final runtime presence of:
    - `ContractMeetingNotes`,
    - `CostInvoiceSyncs`, `CostCategories`, `CostInvoices`, `CostInvoiceItems`,
    - `InvoiceKsefMetadata`,
    - columns `Invoices.CorrectedInvoiceId`, `Invoices.CorrectionReason`, `Invoices.KsefNumber`, `Invoices.KsefStatus`, `Invoices.KsefSessionId`, `Invoices.KsefUpo`,
    - `PersonAccounts`, `PersonProfiles`, `PersonProfileExperiences`, `PersonProfileEducations`, `SkillsDictionary`, `PersonProfileSkills`.

### 7. Rollback

- If rollback needed, execute controlled DBA rollback per affected migration scope; for idempotent column additions, drop columns only after dependency review.

### 8. Owner

- Runtime migration reconciliation session (Codex + repository owner).

## 2026-02-15 - Contract Meeting Notes DB apply gate closure for N5

### 1. Scope

- Executed runtime apply of:
    - `src/contractMeetingNotes/migrations/001_create_contract_meeting_notes.sql`
- Added migration runner utility for controlled execution in this repo:
    - `tmp/run-contract-meeting-notes-migration.ts`
- Verified runtime schema objects required before frontend rollout (N5).

### 2. DB impact

- Runtime schema changed in target DB (`development` -> `localhost/envikons_myEnvi`):
    - table `ContractMeetingNotes` created,
    - unique key `uq_contractmeetingnotes_contract_sequence` (`ContractId`, `SequenceNumber`) present,
    - index `idx_contractmeetingnotes_meetingid` (`MeetingId`) present,
    - FK `fk_contractmeetingnotes_meeting` (`MeetingId` -> `Meetings(Id)`) present.

### 3. ENV impact

- `.env.example`: not needed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: no new vars required.
- Restart/release steps:
    - DB gate for Contract Meeting Notes is closed.
    - Frontend rollout can proceed only after UI integration is completed and integrated smoke is green.

### 5. Developer actions

- Run migration apply script:
    - `npx ts-node tmp/run-contract-meeting-notes-migration.ts`
- Verify schema:
    - `npx ts-node tmp/verify-contract-meeting-notes-migration.ts`
- Re-run minimum backend checks:
    - `yarn jest src/contractMeetingNotes/__tests__/ContractMeetingNotesRouters.test.ts src/contractMeetingNotes/__tests__/ContractMeetingNoteRepository.test.ts --runInBand`
    - `yarn build`

### 6. Verification

- Before apply:
    - `npx ts-node tmp/verify-contract-meeting-notes-migration.ts` -> `tableExists=false`.
- Apply:
    - `npx ts-node tmp/run-contract-meeting-notes-migration.ts` -> `status=ok`.
- After apply:
    - `npx ts-node tmp/verify-contract-meeting-notes-migration.ts` -> table/index/FK evidence present.
- Regression:
    - router/repository test suites pass; build passes.

### 7. Rollback

- If rollback required:
    - stop N5 rollout immediately,
    - drop `ContractMeetingNotes` table using controlled DBA procedure (after data retention decision),
    - keep feature UI/API rollout disabled until corrected schema is re-applied and re-verified.

### 8. Owner

- Contract Meeting Notes session (Codex + repository owner).

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

## 2026-02-13 - Invoice corrections DB migration (CorrectedInvoiceId, CorrectionReason)

### 1. Scope

- Added missing SQL migration for invoice correction columns used by invoice correction flows.
- New file: `src/invoices/migrations/001_add_invoice_correction_columns.sql`.

### 2. DB impact

- Schema change in `Invoices`:
    - added nullable `CorrectedInvoiceId` (`INT`),
    - added nullable `CorrectionReason` (`TEXT`).
- No data backfill required.

### 3. ENV impact

- `.env.example`: not needed.
- New/changed variables: none.

### 4. Heroku impact

- Config vars: not required.
- Restart/release steps:
    - run migration in target DB before/with deploy,
    - restart backend process after migration.

### 5. Developer actions

- Execute SQL migration:
    - `src/invoices/migrations/001_add_invoice_correction_columns.sql`
- Verify both columns exist in runtime DB.

### 6. Verification

- Run:
    - `SHOW COLUMNS FROM Invoices LIKE 'CorrectedInvoiceId';`
    - `SHOW COLUMNS FROM Invoices LIKE 'CorrectionReason';`
- Verify `POST /invoices` no longer fails with `Unknown column 'Invoices.CorrectedInvoiceId'`.

### 7. Rollback

- If rollback is required, drop added columns from `Invoices` in controlled maintenance window:
    - `ALTER TABLE Invoices DROP COLUMN CorrectedInvoiceId, DROP COLUMN CorrectionReason;`

### 8. Owner

- Invoice corrections stabilization (Codex + repository owner).

## 2026-02-12 - KSeF sync non-JSON response handling + API base URL override

### 1. Scope

- Added defensive handling for non-JSON responses in `KsefService.requestJson`.
- Added optional env override `KSEF_API_BASE_URL` used by `KsefService.getApiUrl()`.
- Improved KSeF error diagnostics with status/content-type/requestUrl/responseUrl/body preview.

### 3. ENV impact (contract meeting notes N2 continued)

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
- No data migration.

### 3. ENV impact

- `.env.example`: updated.
- New/changed variables:
    - `KSEF_API_BASE_URL` (optional override of default KSeF API URL).

### 4. Heroku impact

- Config vars: optional `KSEF_API_BASE_URL` only if default endpoint does not work in target network.
- Restart/release steps:
    - set/unset `KSEF_API_BASE_URL` as needed,
    - restart app dyno/process after env update.

### 5. Developer actions

- No migration/install actions required.
- If KSeF returns HTML/redirect, set `KSEF_API_BASE_URL` to the known-working endpoint used by the environment/team.

### 6. Verification

- Trigger `/cost-invoices/sync` and confirm no `Unexpected token '<'` parsing failure.
- On failure, verify improved diagnostic message includes request/response URLs and content-type.

### 7. Rollback

- Revert this change set and remove `KSEF_API_BASE_URL` from runtime env if needed.

### 8. Owner

- KSeF integration troubleshooting session (Codex + repository owner).

## 2026-02-15 - Contract Meeting Notes N3 create endpoint flow (continued)

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
