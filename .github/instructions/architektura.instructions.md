<!-- canonical: documentation/team/architecture/clean-architecture.md -->
<!-- adapter-type: thin -->

---
applyTo: '**/*.ts'
description: 'Thin adapter for Clean Architecture canonical docs | Version: 3.0'
---

# Architektura (Adapter)

Ten plik jest adapterem narzedziowym. Zrodlo prawdy to canonical docs w `documentation/team/architecture/`.

## Canonical source of truth

- `documentation/team/architecture/clean-architecture.md`
- `documentation/team/architecture/clean-architecture-details.md`
- `documentation/team/architecture/ai-decision-trees.md`
- `documentation/team/architecture/testing-per-layer.md`
- `documentation/team/architecture/refactoring-audit.md`
- `documentation/team/architecture/auth-migration.md`

## Egzekwowanie reguly target vs legacy

- Stosuj target pattern dla calego nowego kodu i migrowanych fragmentow.
- Legacy tolerated dotyczy tylko istniejacego kodu i nie moze byc kopiowane.
- Szczegolowa polityka (Target/Legacy/Migration/Blockers):
  - `documentation/team/architecture/clean-architecture.md#polityka-wzorca-target-vs-legacy`

## Blockers for new code (hard fail)

- `new Model(...)` w Router.
- Bezposrednie wywolania Repository z Router.
- Importy `Controller`/`Repository` w Model.
- DB I/O w Model (`ToolsDb`, SQL).
- Transakcje (`ToolsDb.transaction`) w Repository.

## Workflow dla agenta

1. Najpierw czytaj i cytuj canonical docs.
2. Przy konflikcie: canonical > adapter.
3. Przy zmianie zasad: edytuj canonical, potem zaktualizuj ten adapter.
4. Nie duplikuj dlugich opisow i przykladow w adapterze.