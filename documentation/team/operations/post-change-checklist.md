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
