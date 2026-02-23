# Agent Rules For This Repository

## Canonical docs

1. `documentation/team/*` is the canonical source for operational knowledge.
2. Tool-specific instructions (for example `.github/instructions/*`, Claude/Copilot configs) must map to canonical docs and not duplicate long operational content.

## Mandatory updates for DB/env/deploy changes

1. Update `documentation/team/operations/post-change-checklist.md`.
2. Update `.env.example` when env keys are added/changed.
3. Ensure PR checklist in `.github/PULL_REQUEST_TEMPLATE.md` is completed.

## Repository hygiene

1. Do not create new operational `.md` files in root.
2. Add new runbooks under `documentation/team/runbooks/*`.
3. Add onboarding or operations docs under `documentation/team/onboarding/*` and `documentation/team/operations/*`.

## Cross-repo workspace rules

1. This repository is backend: `C:\Apache24\htdocs\PS-nodeJS`.
2. Frontend lives in a separate repository: `C:\Apache24\htdocs\ENVI.ProjectSite`.
3. If requested files are missing in current `cwd`, check the sibling repository by absolute path before reporting blocker.
4. Do not conclude "files do not exist" until both repositories are checked.
5. For frontend changes, switch working directory to `C:\Apache24\htdocs\ENVI.ProjectSite` and report touched files from that repo.
