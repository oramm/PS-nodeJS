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

## 2026-07-23 - CaseTypeFolders cache (GD link for shared case-type folders)

### Scope

- Case types that are NOT unique-per-milestone share one GD folder across all cases of that type within a milestone; that folder's ID was never persisted anywhere, only individual `Cases.GdFolderId`.
- Added `CaseTypeFolders (MilestoneId, CaseTypeId, GdFolderId)` cache table (PK on the pair). `ContractsWithChildrenRepository.find()` now LEFT JOINs it directly (`CaseType.gdFolderId`/`_gdFolderUrl` in the tree response) - no live Drive API calls on the read path anymore.
- `Case.createFolder()` now sets `this._type.gdFolderId` when it resolves/creates the shared type folder; `CasesController.persistCaseTypeFolder()` upserts it into `CaseTypeFolders` after create/edit-folder calls (best-effort, does not block the main flow) - so all NEW case-type folders self-populate the cache going forward.
- OLD case-type folders predate this and have no row yet. One-time backfill script `src/scripts/backfill-case-type-folders.ts` (dry-run by default, `--apply` to write) finds missing `(MilestoneId, CaseTypeId)` pairs via `Cases.GdFolderId`, resolves each via a single Drive `parents[0]` lookup, and upserts.
- Reverted an earlier in-session draft that instead ran the Drive lookup live inside `ContractsWithChildrenController.find()` on every request (via a `BaseController`/`withAuth` refactor) - removed, since neither caller (`/contractsWithChildren` router, `ScrumboardReportController`) passes `auth`, so it would have silently fetched a fresh OAuth token + hit Drive API on every tree load.

### Impact

- DB: new table `CaseTypeFolders`. Additive only, no existing table touched.
- ENV: none.
- Deploy: apply `src/contracts/milestones/cases/caseTypes/migrations/005_case_type_folders.sql` before/with backend deploy. Then run `yarn backfill:case-type-folders` (dry-run) to see how many old pairs are missing, then `yarn backfill:case-type-folders:apply` to populate them (needs `REFRESH_TOKEN` in env).

### Required Actions

- Apply migration 005 on development and production.
- Run the backfill script (dry-run first) once per environment after the migration lands, so existing case-type folders get their GD link without waiting for someone to next create/edit a case of that type.

### Verification

- `yarn build` (tsc) passes.
- Targeted jest run for `src/contracts` in progress at time of writing - see next session/agent for pass/fail before marking rollout-safe.

### Rollback

- `src/contracts/milestones/cases/caseTypes/migrations/005_case_type_folders_down.sql` (drops the table) + revert the code (JOIN, `persistCaseTypeFolder`, `CaseType.setGdFolderIdAndUrl`, backfill script).

### Links

- `src/contracts/milestones/cases/caseTypes/migrations/005_case_type_folders.sql`
- `src/contracts/milestones/cases/caseTypes/CaseTypeFolderRepository.ts`
- `src/scripts/backfill-case-type-folders.ts`
- `src/contracts/ContractsWithChildrenRepository.ts`, `src/contracts/milestones/cases/CasesController.ts`

## 2026-07-17 - Case statuses (Cases.Status)

### Scope

- Added case statuses `'Na zaś' | 'W trakcie' | 'Zamknięta'` (`Setup.CaseStatus` / `MainSetup.CaseStatus`), analogous to milestone statuses.
- Backend: new `Cases.Status` column, status in Case model/CaseRepository, `statuses[]` filter in `CasesSearchParams`, `_fieldsToUpdate` support in `PUT /case/:id` (DB-only edits skip GD/Scrum and ProcessInstances reset), server-side status value validation in `CasesRouters`.
- Frontend: `CaseStatusSelector` in case/subcase modals (default `'Na zaś'`), `CaseStatusBadge`, inline status dropdown in TasksGlobal tree, status filter (funnel + popover) in `CaseSelectMenuElement` hiding `'Zamknięta'` by default.
- Wrote, but did not execute (pending explicit approval), migration `004_case_statuses.sql`.

### Impact

- DB: new `Cases.Status VARCHAR(30) NOT NULL DEFAULT 'Na zaś'` + backfill inheriting from milestone status (Zakończony/Archiwalny→Zamknięta, Nie rozpoczęty→Na zaś, W trakcie/NULL→W trakcie).
- ENV: none.
- Deploy: apply `src/contracts/milestones/cases/migrations/004_case_statuses.sql` on each target environment before/with backend deploy; frontend deploy after backend.

### Required Actions

- Apply migration 004 on development and production before rollout.
- Deploy backend and frontend together (case selector filters on `status` returned by `/cases`).

### Verification

- Backend `yarn build` (tsc) passes; frontend `tsc --noEmit` passes.
- After migration: `SHOW COLUMNS FROM Cases LIKE 'Status'` and a spot-check that cases under finished milestones have `Status='Zamknięta'`.

### Rollback

- `src/contracts/milestones/cases/migrations/004_case_statuses_down.sql` (drops the column) + revert code.

### Links

- `src/contracts/milestones/cases/migrations/004_case_statuses.sql`
- `src/contracts/milestones/cases/CaseRepository.ts`
- `C:/xampp/htdocs/envi/ENVI.ProjectSite/src/View/Modals/CommonFormComponents/CaseStatusFilter.tsx`

## 2026-07-17 - Invoice buyer (Nabywca FV) on our contracts + JST auto-fill/lock

### Scope

- Added optional `OurContractsData.InvoiceBuyerEntityId` (nullable FK -> `Entities(Id)`, `ON DELETE RESTRICT`) via migration `src/contracts/migrations/005_add_invoice_buyer_to_our_contracts.sql`. Server model/repo hydrate `ContractOur._invoiceBuyer` (new `LEFT JOIN Entities AS InvoiceBuyers` in the contract search query). Soft (log-only) buyer-consistency guard added in `InvoiceValidator.checkInvoiceBuyerConsistency`.
- Frontend (`ENVI.ProjectSite` master `4735e6e`): "Nabywca FV" selector on the our-contract form + auto-fill/lock of buyer (gmina) + receiver (Podmiot3 role 8 = Zamawiajacy) on a NEW invoice from a contract that carries the field.
- Deployed: server `main` `0befe1e` -> Heroku `erp-envi` v476; front `master` -> GitHub Pages.

### Impact

- DB: kylos `envikons_myEnvi` gained nullable `OurContractsData.InvoiceBuyerEntityId` + FK `FK_OurContractsData_InvoiceBuyerEntityId`. Additive only, zero backfill, zero data touched.
- ENV: none.
- Deploy: Heroku v476 (release gate `migrate verify` green — 005 applied, unrelated FIDman migration 004 intentionally NOT part of this commit and NOT applied to kylos). Front on Pages.

### Required Actions

- Migration 005 applied to kylos 2026-07-17 (backup-first) BEFORE server push — required ordering because the Heroku release gate blocks deploy on any pending migration in the deployed repo.
- Owner-tail (outside this change): set contract 871 `Nabywca FV = entity 459` in the UI; owner issues the first real invoice + KSeF send; then RO post-check (entity 459 + its 18 invoices byte-untouched, baseline SUM(Id)=94805; outbox 871 payload NIP `7871006601`; AQM model3 org 44/54 unchanged).

### Verification

- `migrate:list` on kylos: `pending=1 drift=0`, `005 APPLIED` (executionMillis=950); only unrelated FIDman `004` remains pending (not in deployed repo).
- Hard read-only smoke: deployed `ContractRepository.find([])` against kylos -> 793 contracts, new JOIN clean, 0 with `_invoiceBuyer` (pre-871-config).
- Heroku v476 web dyno `up`; Pages workflow `success`.
- RO baseline: entity 459 + 18 invoices unchanged (SUM(Id)=94805, Id 4425-6248); `OurContractsData.871.InvoiceBuyerEntityId = NULL`.

### Rollback

- Backup of `OurContractsData` before migration: `scratchpad/kylos-OurContractsData-pre005-20260717-073437.sql` (single-table mysqldump, restorable).
- Schema rollback (additive, safe): `src/contracts/migrations/005_add_invoice_buyer_to_our_contracts_down.sql` (DROP FK, DROP COLUMN) — only after reverting the app code that reads the column.

### Links

- `src/contracts/migrations/005_add_invoice_buyer_to_our_contracts.sql`
- `src/contracts/ContractRepository.ts`, `src/invoices/InvoiceValidator.ts`
- Plan/progress: `20_projects/Aplikacje/AQM.APP.01/plans/2026-07-16-psenvi-fv-nabywca-odbiorca-*.md` (SB vault)

## 2026-07-03 - Invoice Status ENUM: add "Odrzucona przez KSeF"

### Scope

- Added a persistent terminal-error status for invoices rejected by KSeF: backend `KsefController.checkStatusByInvoiceId` now writes `Invoices.Status = 'Odrzucona przez KSeF'` and `Invoices.KsefStatus = 'ERROR'` when KSeF returns a terminal error code (>=400, excluding 440 duplicate), instead of silently leaving the invoice stuck on "Wysłana do KSeF" forever.
- Wrote, but did not execute (pending explicit approval), the SQL migration widening the `Invoices.Status` ENUM to include the new value.

### Impact

- DB: `Invoices.Status` ENUM needs `'Odrzucona przez KSeF'` appended; without this migration, MariaDB (non-strict mode) silently truncates the write to `''` instead of erroring, which is exactly the bug this migration fixes (confirmed empirically on local dev DB `envi_16_06`, invoice Id 6283).
- ENV: none.
- Deploy: run migration `src/invoices/migrations/009_add_invoice_ksef_error_status.sql` on every target environment (dev, and production before/with backend deploy) before this backend code path can persist the new status correctly.

### Required Actions

- Apply `src/invoices/migrations/009_add_invoice_ksef_error_status.sql` on development and production before/with rollout.
- Any invoice rows already silently corrupted to `Status=''` by this bug (e.g. Invoices.Id 6283 on local dev) need a corrective re-check (click "Odśwież status") or manual UPDATE after the migration lands.

### Verification

- After migration: `SHOW COLUMNS FROM Invoices WHERE Field='Status'` should list `'Odrzucona przez KSeF'` in the enum.
- Re-trigger a KSeF rejection check on an affected invoice and confirm `Invoices.Status` persists as `'Odrzucona przez KSeF'` (not `''`) via direct DB read, and that the frontend badge/buttons reflect it after a full page reload (not just in-session).

### Rollback

- `ALTER TABLE invoices CHANGE Status Status ENUM('Na później','Do zrobienia','Zrobiona','Wysłana','Gotowa do wysłania KSeF','Wysłana do KSeF','Zapłacona','Wycofana','Do korekty') CHARACTER SET utf8 COLLATE utf8_polish_ci NOT NULL;` (matches migration `007_add_invoice_status.sql`) — only safe if no row currently holds the new value.

### Links

- `src/invoices/migrations/009_add_invoice_ksef_error_status.sql`
- `src/invoices/KSeF/KsefController.ts`
- `src/setup/Setup.ts`
- `C:/xampp/htdocs/envi/ENVI.ProjectSite/src/Erp/InvoicesList/InvoiceDetails/KsefSection.tsx`

## 2026-06-26 - SubCaseNumber for child cases

### Scope

- Added a dedicated `Cases.SubCaseNumber` column for local numbering of sub-cases.
- Updated case creation and read models so `Number` stays trigger-managed while display labels use `SubCaseNumber` for child cases.
- Wrote, but did not run, the SQL migration for the new column and unique `(ParentCaseId, SubCaseNumber)` index.

### Impact

- DB: new nullable `Cases.SubCaseNumber` column and unique index on `(ParentCaseId, SubCaseNumber)`.
- ENV: none.
- Deploy: backend code must land together with the DB migration.

### Required Actions

- Apply `src/contracts/milestones/cases/migrations/002_sub_case_number.sql` in the target database.
- Deploy the backend after the migration so new sub-cases store local numbering in `SubCaseNumber`.

### Verification

- `yarn -s tsc --noEmit`

### Rollback

- Drop the `SubCaseNumber` column and `uq_cases_parent_sub_case_number` index, then revert the backend changes.

### Links

- `src/contracts/milestones/cases/migrations/002_sub_case_number.sql`
- `src/contracts/milestones/cases/migrations/002_sub_case_number_down.sql`
- `documentation/team/features/sub-case-propagation.md`

## 2026-06-27 - AQM WS11 PS data remediation

### Scope

- Added six `Contracts_Entities` EMPLOYER associations for active TypeId=10 AQM contracts, then added Eko-Babice contract 497 -> entity 245, using `Invoices.ContractId/EntityId` as the authoritative source and validating each NIP with the WS10 O2 checksum rule.

### Impact

- DB: production PS ENVI data changed on `envi-konsulting.kylos.pl/envikons_myEnvi`; contracts 748, 772, 860, 1053, 1081, 1231, and 497 now have one EMPLOYER each.
- ENV: none.
- Deploy: no PS deploy. Frontend fix was pushed to ENVI.ProjectSite `master` (`4d4ea8b`) but not deployed here. `aqm:backfill --apply` was run after backup and fully reconciled.

### Required Actions

- M1 closed after owner decision: Eko-Babice is a closed contract and should use the customer from invoices, not a new active PS contract.
- Keep M3 prod AQM backfill owner-gated and backup-first.
- Do not run `aqm:backfill --apply` again until the 2026-06-27 apply output is reconciled; next session starts from outbox/AQM reads.
- During M3 final reconciliation, explicitly verify Eko-Babice AQM organization after apply: WS10 should match by NIP 1181462152 and link `legacy_entity_id` to PS `EntityId=245` (it was legacy id 29 before PS-master link).
- 2026-06-27 M3 final reconciliation complete and owner-acked; WS11 plan closed as `done`. Do not retry/apply unless a new, separate delta is approved.
- Frontend fix `_employers` is pushed to ENVI.ProjectSite `master` (`4d4ea8b`); deployment still needs separate GO before rollout.

### Verification

- Independent MCP read confirmed all six target contracts have `EmployerCount=1`.
- AQM TypeId=10 re-audit changed from 32 pushable / 58 without EMPLOYER to 38 pushable / 52 without EMPLOYER.
- `aqm:backfill` dry-run on `NODE_ENV=production` reported total 90, qualify 38, skipped 52, and wrote nothing; `AqmSyncOutbox` remained 32 SENT.
- 2026-06-27 repeated gate-check: PS still 90 TypeId=10, 38 pushable, 52 without EMPLOYER, `AqmSyncOutbox` 32 SENT; AQM prod still 33 `org_contracts` = 32 with `legacy_contract_id` + 1 native Eko-Babice.
- 2026-06-27 after adding 497 -> 245: MCP read confirmed contract 497 has EMPLOYER 245 and NIP 1181462152; re-audit is 39 pushable / 51 without EMPLOYER / 0 multiple / 90 total. `aqm:backfill` dry-run reported total 90, qualify 39, skipped 51, and wrote nothing; `AqmSyncOutbox` remained 32 SENT.
- 2026-06-27 Eko-Babice SELECT check: PS `Entities.Id=245` already has NIP 1181462152, contract 497 has three invoices with `EntityId=245`, and `Contracts_Entities` has 497 -> 245 EMPLOYER; AQM prod native `org_contracts.id=1` has organization NIP 1181462152. No PS DB update was needed.
- 2026-06-27 OurContract client validation check: frontend `_employers` selector now keeps array-shaped form state; AQM exact-one rule remains in Yup schema.
- 2026-06-27 WS10 code check: AQM ingest matches organization by `legacy_entity_id` first, then normalized NIP; for Eko-Babice, current AQM `legacy_entity_id=29` and PS payload `legacyEntityId=245` means the expected path is NIP match and relink to 245.
- 2026-06-27 M3 start: AQM prod backup created at `/var/backups/aqm/aqm_2026-06-27_105402.sql.gz`; `aqm:backfill --apply` on `NODE_ENV=production` reported total 90, qualify 39, skipped 51, newly enqueued 7, already enqueued/synced 32. Post-apply outbox/AQM reconciliation was not run yet.
- 2026-06-27 M3 monitoring: `AqmSyncOutbox` is 39 SENT / 0 PENDING / 0 FAILED; the seven new ContractIds 497, 748, 772, 860, 1053, 1081, 1231 are SENT with `LastError=NULL`.
- 2026-06-27 final reconciliation: PS TypeId=10 audit is 90 total / 39 pushable / 51 without EMPLOYER / 0 multiple; AQM prod read-only is 40 `org_contracts` total, 39 with `legacy_contract_id`, 1 native NULL, and no duplicate `legacy_contract_id`.
- 2026-06-27 set equality: the 39 PS pushable ContractIds exactly match the 39 AQM `org_contracts.legacy_contract_id` values.
- 2026-06-27 Eko-Babice post-apply check: AQM organization NIP 1181462152 has `legacy_entity_id=245`, no organization has `legacy_entity_id=29`, and AQM now has PS-master `legacy_contract_id=497` under that organization.
- 2026-06-27 WS11 closeout: SB plan/progress/activity-log closed; WS12 concurrency gate cleared for N1.

### Rollback

- Remove only the added `Contracts_Entities` rows for the listed ContractId/EntityId pairs if the owner asks to revert the remediation.

### Links

- `C:\Users\oram\ENVISecondBrain\20_projects\Aplikacje\AQM.APP.01\plans\2026-06-26-aqm3-ws11-backfill-reconciliation-progress.md`

## 2026-06-17 - Heroku OCR buildpack and scan fallback

### Scope

- Added a root `Aptfile` for Heroku OCR dependencies.
- Updated PDF text extraction so scanned documents can fall back to local OCR when `pdf-parse` does not extract enough text.

### Impact

- DB: none.
- ENV: none.
- Deploy: Heroku needs `heroku-buildpack-apt` before `heroku/nodejs` so `poppler-utils` and `tesseract-ocr` are available at runtime.

### Required Actions

- Add `heroku-buildpack-apt` as the first Heroku buildpack and keep the Node buildpack second.
- Verify a scanned PDF through the AI document analysis endpoint after deploy.

### Verification

- Typecheck should pass after the OCR fallback change.
- Scanned PDF uploads should now produce extracted text via OCR instead of returning an empty text payload.

### Rollback

- Remove the OCR buildpack, delete `Aptfile`, and revert the `ToolsAI` fallback if the OCR path causes regressions.

### Links

- `Aptfile`
- `src/tools/ToolsAI.ts`
- `documentation/team/operations/deployment-heroku.md`

## 2026-06-02 - Heroku release gate temporarily disabled

### Scope

- Removed the Heroku `release` command from `Procfile` to unblock production deploys.
- Recorded the operational pause because Heroku Common Runtime release dynos time out when connecting to `envi-konsulting.kylos.pl:3306`.

### Impact

- DB: none.
- ENV: none.
- Deploy: Heroku no longer runs `yarn node build/scripts/migrate.js verify` during release; deploys advance directly to the `web` process.

### Required Actions

- Keep migration verification as an operator-run step until DB connectivity from Heroku is fixed.
- Re-enable the `release` gate after Heroku can reach the production DB reliably.

### Verification

- Heroku releases `v416`, `v417`, and `v418` failed in release phase with `connect ETIMEDOUT` for `envi-konsulting.kylos.pl/envikons_myEnvi`.
- Local connectivity to `envi-konsulting.kylos.pl:3306` succeeds, which points to a Heroku-to-DB network path issue.

### Rollback

- Restore `release: yarn node build/scripts/migrate.js verify` in `Procfile` after DB connectivity from Heroku is confirmed.

### Links

- `Procfile`
- `documentation/team/operations/deployment-heroku.md`

## 2026-05-09 - SchemaMigrations runner and Heroku verify gate

### Scope

- Added a shared TypeScript SQL migration runner at `src/scripts/migrate.ts` with `list`, `verify`, `apply`, and `baseline` modes.
- Added DB-backed migration tracking through `SchemaMigrations` and wired package scripts plus Heroku `release` verify gate.
- Updated migration and deployment runbooks for baseline-first rollout.

### Impact

- DB: each target database now needs `SchemaMigrations`; it is created automatically by the runner.
- ENV: none.
- Deploy: baseline historical migrations on each environment, run `yarn migrate:verify`, then rely on the Heroku release gate.

### Required Actions

- Manually confirm historical schema state on development and production.
- Run `yarn migrate:baseline` once per environment where historical migrations are already present but untracked.
- Run `yarn migrate:verify` after baseline and before subsequent deploys.

### Verification

- Targeted Jest tests for the runner passed.
- `yarn build` passed and emits `build/scripts/migrate.js` for Heroku release usage.

### Rollback

- Remove the Heroku release gate only if rollout must be paused.
- Keep `SchemaMigrations` as audit state unless a deliberate rollback plan for migration tracking is approved.

### Links

- `src/scripts/migrate.ts`
- `documentation/team/runbooks/db-migration-execution.md`
- `documentation/team/operations/deployment-heroku.md`

## 2026-04-08 - Invoice KSeF correction type persisted in DB

### Scope

- Added persistent optional field `KsefCorrectionType` on `Invoices` (values `1|2|3|null`) to replace browser local storage for correction type selection.
- Updated backend invoice model/repository and KSeF correction XML generation to treat `TypKorekty` as optional (no implicit default).
- Updated frontend correction/KSeF views to save correction type through API and read it from invoice data.

### Impact

- DB: new nullable column `Invoices.KsefCorrectionType` via migration.
- ENV: none.
- Deploy: run migration `src/invoices/migrations/006_add_invoice_ksef_correction_type.sql` before rollout.

### Required Actions

- Apply migration on each environment before deploying backend/frontend code.
- Verify correction flow: select type, refresh page, ensure value persists and is used in XML preview/send.

### Verification

- Backend and frontend builds pass after change.
- XML preview for correction shows full KSeF wording and supports missing type (optional field).

### Rollback

- Revert code and keep column unused; or drop `KsefCorrectionType` column if full rollback is required.

### Links

- `src/invoices/migrations/006_add_invoice_ksef_correction_type.sql`
- `src/invoices/KSeF/KsefXmlBuilder.ts`
- `src/invoices/KSeF/KsefController.ts`
- `C:/xampp/htdocs/envi/ENVI.ProjectSite/src/Erp/InvoicesList/InvoiceDetails/KsefSection.tsx`

## 2026-04-01 - Invoice multi-Podmiot3 with per-entry role (KSeF FA(3))

### Scope

- Added support for many `Podmiot3` entries per invoice with independent role selection (roles 1-10).
- Added backend persistence table `InvoiceThirdParties` and list-based mapping in invoice read/write flow.
- Updated KSeF validator and XML builder to emit many `Podmiot3` blocks and validate role constraints for JST/GV (`8` / `10`).
- Updated frontend invoice modal/details to manage and display multiple `Podmiot3` records.

### Impact

- DB: new table `InvoiceThirdParties` with migration and one-time backfill from legacy invoice columns.
- ENV: none.
- Deploy: run migration `src/invoices/migrations/005_create_invoice_third_parties_table.sql` before backend/frontend rollout.

### Required Actions

- Apply migration on all target environments before deployment.
- Verify add/edit invoice flow for multiple `Podmiot3` entries and KSeF XML generation with repeated `Podmiot3` sections.

### Verification

- Backend targeted tests updated and passing for KSeF `Podmiot3` validator/builder scenarios.
- Frontend build passes with dynamic `Podmiot3` list UI and role selectors.

### Rollback

- Revert application code; if full rollback is needed, archive/drop `InvoiceThirdParties` after data backup.

### Links

- `src/invoices/migrations/005_create_invoice_third_parties_table.sql`
- `src/invoices/KSeF/KsefXmlBuilder.ts`
- `src/invoices/KSeF/InvoiceKsefValidator.ts`
- `C:/xampp/htdocs/envi/ENVI.ProjectSite/src/Erp/InvoicesList/Modals/InvoiceModalBody.tsx`

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
