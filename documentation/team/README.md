# Team Docs

`documentation/team/*` is the canonical operational documentation for this repository.

## How to use

1. Start with `documentation/team/onboarding/*` for setup, environment, and access.
2. Use `documentation/team/runbooks/*` for repeatable team procedures.
3. Use `documentation/team/operations/*` for DB/env/deploy changes and post-change records.
   Read `post-change-checklist.md` first; open quarterly archive files only when older rollout context is needed.
4. Treat this repository as the documentation hub for cross-repo work touching both `PS-nodeJS` and `ENVI.ProjectSite`.
5. Do not add new operational `.md` files in repository root.

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
- `documentation/team/operations/<initiative>/plan.md` (temporary, active tasks only)
- `documentation/team/operations/<initiative>/progress.md` (temporary, active tasks only)
- `documentation/team/operations/<initiative>/activity-log.md` (temporary, active tasks only)

## Initiative ownership

Operational initiatives are classified before documents are created. Canonical ownership rules live in `documentation/team/operations/docs-map.md` (section `Model cross-repo`).

Short rule: cross-repo and deploy/db/env work is backend-owned; frontend-only work stays in `ENVI.ProjectSite`. For stable modules, code is the implementation documentation. Repository docs describe rules, decisions, rollout, evidence, and knowledge that is not obvious from code.

Closed tasks policy:

1. Update canonical docs in `documentation/team/*` to the latest system state.
2. Add/maintain operational rollout facts in `documentation/team/operations/post-change-checklist.md` when DB/env/deploy is affected.
   Keep the active file compact and move older entries to `documentation/team/operations/post-change-checklist-archive/`.
3. Remove temporary `plan/progress/activity-log` for closed tasks or compress them into one short final-state note in canonical docs (history remains in git).

## Change policy

For every change that affects DB, environment variables, or deployment:

1. Update relevant file(s) in `documentation/team/*`.
2. Add an entry to `documentation/team/operations/post-change-checklist.md`.
3. Complete the documentation checkboxes in `.github/PULL_REQUEST_TEMPLATE.md`.
