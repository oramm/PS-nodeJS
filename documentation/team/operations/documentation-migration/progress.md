# Documentation Migration - Progress

Data bazowa: 2026-02-22
Owner: Backend + Frontend
Status ogolny: DONE

## Checkpointy

- D0-CANONICAL-STRUCTURE: DONE
- D1-REFERENCE-NORMALIZATION: DONE
- D2-FACTORY-ALIGNMENT: DONE
- D3-VISUALIZATION-LAYER: DONE

## Biezacy stan

### DONE

- Uporzadkowano warstwe B na backendzie do struktury folderowej dla glowych strumieni.
- Utworzono kanoniczny epic dokumentacyjny: `documentation/team/operations/documentation-migration/`.
- Dodano komplet plikow: `plan.md`, `progress.md`, `activity-log.md`.
- Utworzono frontendowy strumien `docs/operations/persons-v2-ui/` z trio plikow.
- Dodano pierwszy diagram warstwy V (`documentation/team/architecture/system-context.md`).

### IN_PROGRESS

- Brak.

### TODO

- Brak.

## Sesje

### 2026-02-22 - Session DOC-MIGRATION-STRUCTURE-1

Checkpoint: `D0-CANONICAL-STRUCTURE`
Status: `DONE`

Evidence:

- `documentation/team/operations/documentation-migration/plan.md`
- `documentation/team/operations/documentation-migration/progress.md`
- `documentation/team/operations/documentation-migration/activity-log.md`
- `C:\Apache24\htdocs\ENVI.ProjectSite\docs\operations\persons-v2-ui\plan.md`
- `C:\Apache24\htdocs\ENVI.ProjectSite\docs\operations\persons-v2-ui\progress.md`
- `C:\Apache24\htdocs\ENVI.ProjectSite\docs\operations\persons-v2-ui\activity-log.md`

### 2026-02-22 - Session DOC-MIGRATION-REFS-2

Checkpoint: `D1-REFERENCE-NORMALIZATION` + `D2-FACTORY-ALIGNMENT`
Status: `DONE`

Evidence:

- `factory/AUDIT-SERVER.md`
- `factory/DOCS-MAP.md`
- `documentation/team/README.md`
- `documentation/ai/README.md`
- `documentation/team/operations/documentation-migration-plan.md` (legacy pointer)
- Globalne wyszukiwanie bez trafieĹ„ dla starych Ĺ›cieĹĽek pĹ‚askich

### 2026-02-22 - Session DOC-MIGRATION-VISUAL-3

Checkpoint: `D3-VISUALIZATION-LAYER`
Status: `DONE`

Evidence:

- `documentation/team/architecture/system-context.md`
- `documentation/team/operations/documentation-migration/plan.md`
- `documentation/team/operations/documentation-migration/progress.md`
- `documentation/team/operations/documentation-migration/activity-log.md`

### 2026-02-22 - Session DOC-MIGRATION-REORG-4

Checkpoint: `FINAL-3-LAYER-MODEL`
Status: `DONE`

Wdrozono reorganizacje systemu dokumentacji do modelu 3-warstwowego (Canonical / Adaptery / Factory):

Evidence:

- `documentation/team/architecture/` â€” 9 nowych plikow canonical (clean-architecture.md, ai-decision-trees.md, testing-per-layer.md, refactoring-audit.md, auth-migration.md, clean-architecture-details.md, system-map.md, conventions/coding-server.md, conventions/coding-client.md)
- `factory/AUDIT-SERVER.md`, `factory/AUDIT-CLIENT.md` - redirect stubs
- `factory/SYSTEM-MAP.md` - stub usuniety po migracji; canonical: `documentation/team/architecture/system-map.md`
- `.github/instructions/architektura.instructions.md` â€” sync header dodany, pelna tresc zachowana
- `.github/instructions/architektura-*.md`, `.github/instructions/refactoring-auth-pattern.md` â€” redirect stubs
- `factory/DOCS-MAP.md` â€” przepisany na model 3 warstw z nazwami opisowymi
- `CLAUDE.md` â€” skondensowany (~18% krotszy), 4 sekcje ze skrotami + linki do canonical
- `factory/CONCEPT.md`, `factory/TOOL-ADAPTERS.md`, `factory/prompts/planner.md` â€” zaktualizowane sciezki
- `documentation/ai/README.md`, `documentation/team/README.md`, `.github/copilot-instructions.md` â€” zaktualizowane
