# Deployment Heroku

## Scope

Runbook for production deploys on Heroku.

## Before release

1. Confirm required config vars exist and are current.
2. Confirm DB/env/deploy-impacting changes are documented in:
   - `documentation/team/operations/post-change-checklist.md`
   - `.github/PULL_REQUEST_TEMPLATE.md` checkboxes
3. Confirm `.env.example` reflects any new env keys.
4. Confirm `yarn migrate:verify` passes for the target DB state.
5. If the migration runner is newly introduced on an environment, complete baseline rollout before enabling or relying on the release gate.

## Release flow

1. Deploy to Heroku app (pipeline or git-based flow used by team).
2. Heroku `release` runs `yarn node build/scripts/migrate.js verify` in verify-only mode.
3. If release fails because of pending migrations, checksum drift, or DB-only migration records, stop rollout and resolve DB state first.
4. Apply or baseline migrations outside app startup, using controlled operator commands.
5. Verify application health and critical endpoints after a green release.

## Release gate policy

- Heroku does not auto-apply migrations on startup.
- Release succeeds only when repo migrations and `SchemaMigrations` are consistent.
- `*_down.sql` files are ignored by the release gate.
- Checksum drift means an already-tracked migration file changed after rollout and must be fixed by a new migration, not by editing the old one.
- If Heroku Common Runtime cannot reach the external DB host, temporarily remove the `release` command from `Procfile`, deploy the web dyno without the gate, record the pause in `documentation/team/operations/post-change-checklist.md`, and restore `release: yarn node build/scripts/migrate.js verify` only after Heroku can reliably reach the production DB and release-phase verification succeeds again.

## Baseline-first activation

1. Deploy build containing the migration runner.
2. Manually verify historical schema on each environment.
3. Run `yarn migrate:baseline` on each environment as needed.
4. Run `yarn migrate:verify` and record evidence.
5. Only then rely on the Heroku release gate for future deploys.

## Config vars

- Keep names aligned with `.env.example`.
- Record any new or changed vars in the checklist entry.
- Never store secret values in repo docs.

## Native OCR dependencies

- If the app needs OCR for scanned PDFs, add `heroku-buildpack-apt` before `heroku/nodejs`.
- Keep a root-level `Aptfile` with `poppler-utils`, `tesseract-ocr`, `tesseract-ocr-eng`, and `tesseract-ocr-pol`.
- Verify that scanned PDF uploads still work after the buildpack change by calling the AI document analysis endpoint.
- If the app is moved to a Heroku stack that does not support classic buildpacks, switch to the appropriate container/CNB approach before relying on APT packages.

## Rollback

1. Revert to previous release.
2. Revert or disable incompatible config vars if needed.
3. If release failed on `verify`, fix DB state first; app rollback alone does not clear repo-vs-DB migration inconsistency.
4. Execute DB rollback plan if schema/data changed.
5. Re-run smoke verification.

## Required release communication format

1. Scope
2. Impact
3. Required dev action
4. Required Heroku action
5. Verification
6. Deadline
7. Owner
8. Link to checklist entry
