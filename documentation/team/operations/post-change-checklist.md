# Post Change Checklist

Use this file for every change that impacts DB, environment variables, or deployment.

This file is the active operational index, not a full rollout log.

Keep only recent entries here. Move older entries to quarterly archive files under `documentation/team/operations/post-change-checklist-archive/`.

## How to use

1. Update the canonical document that owns the change:
    - `documentation/team/operations/db-changes.md`
    - `documentation/team/onboarding/environment.md`
    - `documentation/team/operations/deployment-heroku.md`
    - relevant runbook or `documentation/team/operations/<feature>/`
2. Add a short entry here when DB/env/deploy is affected.
3. Keep detailed evidence, long command logs, and environment-specific troubleshooting outside this file unless they are required for rollout safety.

## Maintenance Rules

- Keep only active or recent entries in this file.
- Archive older entries to `documentation/team/operations/post-change-checklist-archive/<year>-Q<quarter>.md`.
- Archive when any of the following is true:
    - more than 20 entries are in the active file,
    - an entry is older than 90 days,
    - the file grows beyond roughly 500 lines.
- New entries must use the current compact template.
- Agents should read this file first and open archive files only when older context is needed.

## Template

Copy the block below for each new change:

```md
## YYYY-MM-DD - <short-title>

### Scope

- <what changed>

### Impact

- DB: <none | short impact summary>
- ENV: <none | short impact summary>
- Deploy: <none | short impact summary>

### Required Actions

- <what must happen before/after rollout>

### Verification

- <short verification summary>

### Rollback

- <short rollback summary>

### Links

- <optional runbook / feature doc / migration path>
```

## Active Entries

## 2026-04-01 - Invoice JST/GV flags for KSeF payload

### Scope

- Added invoice-level flags `IsJstSubordinate` and `IsGvMember` to control KSeF `Podmiot2/JST` and `Podmiot2/GV` values.
- Updated invoice model/repository typing and KSeF XML builder mapping (`true -> 1`, `false -> 2`).
- Added frontend checkboxes in invoice add/edit modal with defaults: JST `false`, GV `true`.

### Impact

- DB: new columns in `Invoices`: `IsJstSubordinate` (default `0`) and `IsGvMember` (default `1`).
- ENV: none.
- Deploy: run migration `src/invoices/migrations/002_add_invoice_jst_gv_flags.sql` before deploying backend/frontend changes.

### Required Actions

- Apply migration on all target environments before rollout.
- Verify add/edit invoice flows persist both flags and that KSeF XML contains expected `JST/GV` values.

### Verification

- Backend unit test suite `src/invoices/KSeF/__tests__/KsefXmlBuilder.test.ts` covers explicit and default JST/GV mapping, including correction XML path.
- Frontend production build passes with new modal fields.

### Rollback

- Revert application code and drop columns `IsJstSubordinate`, `IsGvMember` if full rollback is required.

### Links

- `src/invoices/migrations/002_add_invoice_jst_gv_flags.sql`
- `src/invoices/KSeF/KsefXmlBuilder.ts`
- `C:/xampp/htdocs/envi/ENVI.ProjectSite/src/Erp/InvoicesList/Modals/InvoiceModalBody.tsx`

## 2026-03-18 - Runtime bug backlog and bugfix automation scaffold

### Scope

- Added `BugEvents` runtime capture flow with deduplication by fingerprint, per-fingerprint rate limiting, and circuit-breaker persistence behavior.
- Added optional `/client-error` ingest endpoint and CLI scripts: `bugfix:scan`, `bugfix:run`, `bugfix:sync-github`.
- Added admin read model endpoint `/admin/bug-events`, daily inbox generation, and retention archiving automation.
- Added SQL migration for `BugEvents` and `BugEventsArchive` tables.

### Impact

- DB: new tables `BugEvents` and `BugEventsArchive` (migration `src/bugEvents/migrations/001_create_bug_events.sql`).
- ENV: added `BUG_GITHUB_SYNC_ENABLED`, `BUG_GITHUB_REPO`, `BUG_GITHUB_TOKEN`, `BUG_ERROR_MAIL_CRITICAL_ONLY`, `BUG_CLIENT_ERROR_ENABLED`, `BUG_CLIENT_ERROR_SECRET`, `TRUST_PROXY`, `BUG_ADMIN_READ_MODEL_ENABLED`, `BUG_ADMIN_READ_MODEL_SECRET`, `BUGFIX_DAILY_INBOX_*`, `BUGFIX_RETENTION_*`.
- Deploy: run migration before deploying capture-enabled backend; configure env keys before enabling GitHub sync.

### Required Actions

- Apply the BugEvents migration on development and production databases.
- Keep `BUG_GITHUB_SYNC_ENABLED=false` until repository/app credentials are verified.

### Verification

- Unit tests cover fingerprint stability, per-fingerprint rate-limit buffering/replay, and circuit-breaker behavior.
- `yarn bugfix:scan` and `yarn bugfix:run` produce bug context data for local AI sessions.

### Rollback

- Disable capture-dependent workflows, set `BUG_GITHUB_SYNC_ENABLED=false`, and rollback by dropping `BugEventsArchive` then `BugEvents`.

### Links

- `src/bugEvents/migrations/001_create_bug_events.sql`
- `src/scripts/bugfix-scan.ts`
- `src/scripts/bugfix-run.ts`

## 2026-03-13 - Milestones date nullability

### Scope

- Set `Milestones.StartDate` and `Milestones.EndDate` to nullable via a dedicated module migration.
- Added safe verification and execution helpers for local and Kylos rollout.

### Impact

- DB: `Milestones.StartDate/EndDate` now allow `NULL`; column type remains `DATE`.
- ENV: none.
- Deploy: apply the migration in `development` and `production` before deploying code that writes nullable dates; restart backend after rollout.

### Required Actions

- Run the milestones nullability verification and migration scripts in both target environments.
- Run targeted milestone tests after the DB change.

### Verification

- Local `localhost/envikons_myEnvi` and Kylos `envi-konsulting.kylos.pl/envikons_myEnvi` both changed from `nullable=NO` to `nullable=YES`.
- Targeted milestone tests passed.

### Rollback

- Revert nullability with:
    - `ALTER TABLE Milestones MODIFY COLUMN StartDate DATE NOT NULL;`
    - `ALTER TABLE Milestones MODIFY COLUMN EndDate DATE NOT NULL;`

### Links

- `tmp/verify-milestones-dates-nullability.ts`
- `tmp/run-milestones-dates-nullability-migration.ts`

## 2026-03-04 - KSeF FA(3): sentDate/issueDate mapping, payment term and seller bank account

### Scope

- Extended KSeF sales XML mapping with sent date, sale date, payment term, and seller bank account fields.
- Improved purchase-invoice parsing and sync response details.

### Impact

- DB: none.
- ENV: added `KSEF_SELLER_BANK_ACCOUNT` and `KSEF_SELLER_BANK_NAME`; `.env.example` updated.
- Deploy: configure new KSeF seller bank env vars before rollout and restart backend.

### Required Actions

- Set new KSeF seller bank env vars in target environments.
- Run targeted tests and `yarn build`.

### Verification

- Sales XML now includes the new payment and bank-account fields.
- Cost invoice sync/list exposes `saleDate` and `dueDate`.
- Sync response includes failed-invoice counts and `errorDetails`.

### Rollback

- Revert KSeF XML builder/parser changes and remove the new deployment env keys if rollout is reverted.

### Links

- `.env.example`

## 2026-02-22 - Contract Meeting Notes missing GdDocument columns (local dev fix)

### Scope

- Added missing `GdDocumentId` and `GdDocumentUrl` columns plus index to `ContractMeetingNotes`.
- Updated migration runner and verification scripts to cover the new columns.

### Impact

- DB: `ContractMeetingNotes` gained `GdDocumentId`, `GdDocumentUrl`, and index `idx_contractmeetingnotes_gddocumentid`.
- ENV: none.
- Deploy: apply migration `002_add_contract_meeting_notes_gd_document_columns.sql` before deploying code that writes these fields.

### Required Actions

- Run the Contract Meeting Notes migration and post-check on the target DB.
- Run targeted Contract Meeting Notes tests.

### Verification

- Pre-check showed the columns missing; post-check confirmed both columns and the index.
- Targeted test suites passed.

### Rollback

- Drop index `idx_contractmeetingnotes_gddocumentid` and remove `GdDocumentUrl` / `GdDocumentId` if rollback is needed.

### Links

- `src/contractMeetingNotes/migrations/002_add_contract_meeting_notes_gd_document_columns.sql`
- `tmp/run-contract-meeting-notes-migration.ts`
- `tmp/verify-contract-meeting-notes-migration.ts`

## Archive Index

- `2026-Q1`: `documentation/team/operations/post-change-checklist-archive/2026-Q1.md`
