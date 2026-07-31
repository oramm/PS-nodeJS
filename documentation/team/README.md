# Team Docs

`documentation/team/*` is the canonical operational documentation for this repository.

Code and database are the source of truth for how the system works. These docs cover rules,
decisions, procedures and rollout facts that are not visible in code.

## How to use

1. Start with `documentation/team/onboarding/*` for setup, environment, and access.
2. Use `documentation/team/runbooks/*` for repeatable team procedures.
3. Use `documentation/team/operations/*` for DB/env/deploy changes and post-change records.
   Read `post-change-checklist.md` first; open quarterly archive files only when older rollout context is needed.
4. Treat this repository as the documentation hub for cross-repo work touching both `PS-nodeJS` and `ENVI.ProjectSite`.
5. Do not add new operational `.md` files in repository root.

## Structure

- `architecture/clean-architecture.md` — layer rules (target vs legacy)
- `architecture/testing-per-layer.md` — what to mock per layer
- `architecture/system-context.md` — C4 context diagram
- `onboarding/` — local setup, environment, access and secrets
- `runbooks/` — testing, dev-login, local dev orchestration, DB migration execution, bug backlog, public profile link recovery
- `operations/` — db-changes, deployment-heroku, post-change-checklist (+ archive), db-migration-memory

## Initiative docs

Cross-repo and deploy/db/env work is backend-owned; frontend-only work stays in `ENVI.ProjectSite`.

An open initiative may keep `plan.md` / `progress.md` / `activity-log.md` under
`documentation/team/operations/<initiative>/`. These are temporary: when the task closes,
fold anything durable into the canonical docs above and delete them (history stays in git).

## Change policy

For every change that affects DB, environment variables, or deployment:

1. Update relevant file(s) in `documentation/team/*`.
2. Add an entry to `documentation/team/operations/post-change-checklist.md`.
3. Complete the documentation checkboxes in `.github/PULL_REQUEST_TEMPLATE.md`.
