# Documentation Structure Reorg - Activity Log

## 2026-05-31 - Cross-repo governance implementation

- Scope:
    - establish `PS-nodeJS` as cross-repo documentation hub,
    - keep `ENVI.ProjectSite` responsible for FE instructions, UI-only workstreams and GitHub Pages,
    - standardize frontend cross-repo pointers,
    - preserve API/deploy/DB ownership on the backend side.
- Files:
    - `documentation/team/README.md`
    - `documentation/team/operations/docs-map.md`
    - `.github/PULL_REQUEST_TEMPLATE.md`
    - `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\docs-policy.md`
    - `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\README.md`

## 2026-05-31 - Validation

- Verification:
    - checked backend pointer targets with `Test-Path`,
    - searched frontend docs for old cross-repo progress/log/API references with `rg`,
    - searched backend docs for GitHub Pages and cross-repo ownership references with `rg`.

## 2026-05-31 - Review follow-up

- Fixes:
    - corrected nested Markdown numbering in `factory/adapters/copilot-vscode.md`,
    - added naming note for `public-profile-submission` legacy folder vs `Experience Update` product/API name,
    - reduced duplicated ownership rules by making `docs-map.md` the canonical source and linking to it from summary docs.
