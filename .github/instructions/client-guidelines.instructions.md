---
applyTo: 'C:/Apache24/htdocs/ENVI.ProjectSite/**/*.{ts,tsx,js,jsx}'
description: 'Client adapter for ENVI.ProjectSite React, FilterableTable, selectors, RepositoryReact, and client CRUD flow.'
---

# Client Guidelines (ENVI.ProjectSite) - Copilot adapter

Tooling note:
- This file is a thin adapter for Copilot. Keep long operational content in canonical docs.

When to apply:
- React component work in client code.
- FilterableTable data flow changes.
- Selector architecture and business selectors work.
- RepositoryReact updates.
- Client-side CRUD flow changes.

Activation gate (do not apply outside this scope):
- Apply only for frontend tasks in `C:\Apache24\htdocs\ENVI.ProjectSite`.
- Ignore backend-only tasks in `C:\Apache24\htdocs\PS-nodeJS`.

Mandatory files (load first):
1. `C:\Apache24\htdocs\ENVI.ProjectSite\CLAUDE.md`
2. `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\AI_GUIDELINES.md`

Optional files (load by task scope):
- Selectors: `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\selectors-architecture.md`
- Business selectors: `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\business-object-selectors.md`
- FilterableTable: `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\filterable-table-data-flow.md`
- CRUD module: `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\crud-module-guide.md`

Manual invocation fallback:
- In Copilot Chat, ask for `client-guidelines` and pin this file plus the mandatory files.

After loading:
1. Confirm in 1-2 sentences which guidelines were loaded.
2. Apply them to current and subsequent client tasks in this session.
3. Validate code changes against loaded guidelines before finishing.
