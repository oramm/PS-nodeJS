# Team Docs

`docs/team/*` is the canonical operational documentation for this repository.

## How to use

1. Start with `docs/team/onboarding/*` for setup, environment, and access.
2. Use `docs/team/runbooks/*` for repeatable team procedures.
3. Use `docs/team/operations/*` for DB/env/deploy changes and post-change records.
4. Do not add new operational `.md` files in repository root.

## Structure

- `docs/team/onboarding/local-setup.md`
- `docs/team/onboarding/environment.md`
- `docs/team/onboarding/access-and-secrets.md`
- `docs/team/runbooks/dev-login.md`
- `docs/team/runbooks/testing.md`
- `docs/team/operations/db-changes.md`
- `docs/team/operations/deployment-heroku.md`
- `docs/team/operations/post-change-checklist.md`
- `docs/team/operations/persons-v2-refactor-plan.md`
- `docs/team/operations/persons-v2-refactor-progress.md`

## Change policy

For every change that affects DB, environment variables, or deployment:

1. Update relevant file(s) in `docs/team/*`.
2. Add an entry to `docs/team/operations/post-change-checklist.md`.
3. Complete the documentation checkboxes in `.github/PULL_REQUEST_TEMPLATE.md`.
