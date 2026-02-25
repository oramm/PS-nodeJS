---
name: client-guidelines
description: >
  Use when work touches ENVI.ProjectSite frontend/client code: React components,
  FilterableTable views, selectors, RepositoryReact, or client-side CRUD flow.
  Loads mandatory client architecture guidelines and optional topic-specific docs.
---

# client-guidelines

Use canonical client instructions:

- `C:\Apache24\htdocs\ENVI.ProjectSite\CLAUDE.md`
- `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\AI_GUIDELINES.md`

Load optional docs only when relevant:

- Selectors: `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\selectors-architecture.md`
- Business selectors: `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\business-object-selectors.md`
- FilterableTable flow: `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\filterable-table-data-flow.md`
- CRUD module: `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\crud-module-guide.md`

Trigger hints:

- React component edit/request.
- FilterableTable, selectors, RepositoryReact, or client CRUD mention.
- Frontend task explicitly targeting `C:\Apache24\htdocs\ENVI.ProjectSite`.

Activation gate:

- Load only when task scope is frontend/client.
- Do not load for backend-only work in `C:\Apache24\htdocs\PS-nodeJS`.

Manual invocation:

- Mention `client-guidelines` (or `$client-guidelines`) in the request.

Required behavior after loading:

1. Confirm in 1-2 sentences which guidelines were loaded.
2. Apply them to the current and next client tasks in the same session.
3. Check final code against loaded guidelines before completion.
