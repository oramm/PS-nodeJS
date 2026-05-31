# Documentation Structure Reorg - Cross-Repo Plan

Data startu: 2026-05-31
Status dokumentu: ACTIVE
Zakres: Backend hub (`PS-nodeJS`) + Frontend docs policy (`ENVI.ProjectSite`)
Owner: Docs/Process

## Cel

Uspojnic dokumentacje operacyjna w dwoch repozytoriach tak, aby `PS-nodeJS` byl hubem dla architektury, API, DB, env, Heroku deploy i prac cross-repo, a `ENVI.ProjectSite` przechowywal instrukcje FE, UI-only plany oraz pointery do backendowego huba.

## Zasady docelowe

1. Kod stabilnego modulu jest dokumentacja implementacji.
2. Dokumentacja opisuje reguly, decyzje, rollout, evidence i wiedze niewidoczna w kodzie.
3. Kanoniczne reguly ownership sa w `documentation/team/operations/docs-map.md` (`Model cross-repo`).
4. Aktywna inicjatywa ma `plan.md`, `progress.md`, `activity-log.md`; po stabilizacji nastepuje compression step.

## Zakres wdrozenia

- Aktualizacja backendowych canonical docs: `documentation/team/README.md` i `documentation/team/operations/docs-map.md`.
- Aktualizacja frontendowych canonical instructions: `instructions/docs-policy.md` i `instructions/README.md`.
- Przeklasyfikowanie `documentation-structure-reorg` z frontend-only na cross-repo.
- Ujednolicenie pointerow w frontendzie do jednego `plan.md`.
- Przeniesienie cross-repo API/flow dokumentow `public-profile-submission` do backendowego huba.

## Definition of Done

- `docs-map.md` opisuje jeden model ownership dla backend-only, frontend-only, cross-repo i deploy/db/env.
- Frontend nie ma lokalnych progress/log dla pointerow cross-repo.
- `public-profile-submission` ma API/flow source w backend hubie.
- PR checklist przypomina o cross-repo i GitHub Pages ownership.
