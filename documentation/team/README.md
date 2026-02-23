# Team Docs

`documentation/team/*` is the canonical operational documentation for this repository.

## How to use

1. Start with `documentation/team/onboarding/*` for setup, environment, and access.
2. Use `documentation/team/runbooks/*` for repeatable team procedures.
3. Use `documentation/team/operations/*` for DB/env/deploy changes and post-change records.
4. Do not add new operational `.md` files in repository root.

## Structure

- `documentation/team/architecture/clean-architecture.md`
- `documentation/team/architecture/clean-architecture-details.md`
- `documentation/team/architecture/ai-decision-trees.md`
- `documentation/team/architecture/testing-per-layer.md`
- `documentation/team/architecture/refactoring-audit.md`
- `documentation/team/architecture/auth-migration.md`
- `documentation/team/architecture/system-map.md`
- `documentation/team/architecture/system-context.md`
- `documentation/team/architecture/conventions/coding-server.md`
- `documentation/team/architecture/conventions/coding-client.md`
- `documentation/team/onboarding/local-setup.md`
- `documentation/team/onboarding/environment.md`
- `documentation/team/onboarding/access-and-secrets.md`
- `documentation/team/runbooks/dev-login.md`
- `documentation/team/runbooks/testing.md`
- `documentation/team/runbooks/public-profile-submission-link-recovery.md`
- `documentation/team/operations/db-changes.md`
- `documentation/team/operations/deployment-heroku.md`
- `documentation/team/operations/post-change-checklist.md`
- `documentation/team/operations/docs-map.md`
- `documentation/team/operations/<active-feature>/plan.md` (temporary, active tasks only)
- `documentation/team/operations/<active-feature>/progress.md` (temporary, active tasks only)
- `documentation/team/operations/<active-feature>/activity-log.md` (temporary, active tasks only)

Closed tasks policy:

1. Update canonical docs in `documentation/team/*` to the latest system state.
2. Add/maintain operational rollout facts in `documentation/team/operations/post-change-checklist.md` when DB/env/deploy is affected.
3. Remove temporary `plan/progress/activity-log` for closed tasks (history remains in git).

## Change policy

For every change that affects DB, environment variables, or deployment:

1. Update relevant file(s) in `documentation/team/*`.
2. Add an entry to `documentation/team/operations/post-change-checklist.md`.
3. Complete the documentation checkboxes in `.github/PULL_REQUEST_TEMPLATE.md`.
