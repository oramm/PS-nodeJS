# Copilot Instructions

## Canonical references

- `AGENTS.md` — repository rules (docs, DB/env/deploy duties, cross-repo layout)
- `CLAUDE.md` — stack summary, commands, architecture and DB conventions
- `documentation/team/architecture/clean-architecture.md` — layer rules
- `.github/instructions/*` — scoped adapters (architecture, environments, client)

## Rules

1. Run local tests for source changes (`yarn test` or the relevant module suite) before proposing a commit.
2. Check your own diff against the layer rules; blockers are listed in `.github/instructions/architektura.instructions.md`.
3. Do not run `git add .` or `git add -A`; stage only the files you changed.
4. DB/env/deploy changes require an entry in `documentation/team/operations/post-change-checklist.md` and an updated `.env.example`.

## Cross-repo scope (PS-nodeJS + ENVI.ProjectSite)

- If the task touches the frontend, include `C:\Apache24\htdocs\ENVI.ProjectSite` in scope explicitly.
- If your `search` tool is workspace-limited, read files by absolute path instead of claiming a full-text scan.
- If external path access is blocked, say so and ask for the frontend diff; do not present the review as complete.
- For UI verification load `.github/instructions/client-guidelines.instructions.md` and `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\ui-browser-loop.md` (canonical for the browser loop).
