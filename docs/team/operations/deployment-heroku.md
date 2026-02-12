# Deployment Heroku

## Scope

Runbook for production deploys on Heroku.

## Before release

1. Confirm required config vars exist and are current.
2. Confirm DB/env/deploy-impacting changes are documented in:
   - `docs/team/operations/post-change-checklist.md`
   - `.github/PULL_REQUEST_TEMPLATE.md` checkboxes
3. Confirm `.env.example` reflects any new env keys.

## Release flow

1. Deploy to Heroku app (pipeline or git-based flow used by team).
2. Run required release tasks (for example migrations) in controlled order.
3. Verify application health and critical endpoints.

## Config vars

- Keep names aligned with `.env.example`.
- Record any new or changed vars in the checklist entry.
- Never store secret values in repo docs.

## Rollback

1. Revert to previous release.
2. Revert/disable incompatible config vars if needed.
3. Execute DB rollback plan if schema/data changed.
4. Re-run smoke verification.

## Required release communication format

1. Scope
2. Impact
3. Required dev action
4. Required Heroku action
5. Verification
6. Deadline
7. Owner
8. Link to checklist entry
