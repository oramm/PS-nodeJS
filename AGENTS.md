# Agent Rules For This Repository

## Docs

1. `documentation/team/*` is the canonical operational documentation (architecture rules, onboarding, runbooks, operations).
2. Code and database are the source of truth for how the system works. Do not write docs that restate code.
3. Tool-specific files (`CLAUDE.md`, `.github/instructions/*`, `.claude/skills/*`) stay thin and link to canonical docs.

## Mandatory updates for DB/env/deploy changes

1. Update `documentation/team/operations/post-change-checklist.md`.
2. Update `.env.example` when env keys are added/changed.
3. Ensure PR checklist in `.github/PULL_REQUEST_TEMPLATE.md` is completed.

## Repository hygiene

1. Do not create new operational `.md` files in root.
2. Add new runbooks under `documentation/team/runbooks/*`.
3. Add onboarding or operations docs under `documentation/team/onboarding/*` and `documentation/team/operations/*`.
4. Temporary plan/progress/activity-log files are allowed only while a task is open; delete them when it closes (history stays in git).

## Package manager rule

1. Always use `yarn` commands for install, build, test, and scripts (never npm/pnpm in this repo).

## Cross-repo workspace rules

1. This repository is backend: `C:\Apache24\htdocs\PS-nodeJS`.
2. Frontend lives in a separate repository: `C:\Apache24\htdocs\ENVI.ProjectSite`.
3. If requested files are missing in current `cwd`, check the sibling repository by absolute path before reporting blocker.
4. Do not conclude "files do not exist" until both repositories are checked.
5. For frontend changes, switch working directory to `C:\Apache24\htdocs\ENVI.ProjectSite` and report touched files from that repo.
6. For frontend UI verification tasks, refer to `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\ui-browser-loop.md`.
