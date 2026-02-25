---
name: client-guidelines
description: This skill should be used when the user works on frontend/client code from ENVI.ProjectSite, edits React components, modifies FilterableTable views, creates selectors, works with RepositoryReact, or mentions client-side CRUD operations. Provides project-specific React architecture guidelines.
allowed-tools: Read, Glob, Grep
---

# Wytyczne klienta (ENVI.ProjectSite)

Repozytorium klienta: `C:\Apache24\htdocs\ENVI.ProjectSite`

## Obowiązkowe pliki — przeczytaj oba na starcie:

1. **CLAUDE.md klienta** — `C:\Apache24\htdocs\ENVI.ProjectSite\CLAUDE.md`
   - Tech stack, architektura, komendy, routing, RepositoryReact core rules
2. **AI_GUIDELINES.md** — `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\AI_GUIDELINES.md`
   - Szczegółowe wzorce: CRUD flow, FilterableTable, selektory, immutability, typowe błędy

## Opcjonalne pliki — doładuj wg potrzeby zadania:

- Selektory → `instructions/selectors-architecture.md` + `instructions/business-object-selectors.md`
- FilterableTable → `instructions/filterable-table-data-flow.md`
- CRUD moduł → `instructions/crud-module-guide.md`

Ścieżki względem `C:\Apache24\htdocs\ENVI.ProjectSite\`.

## Po przeczytaniu:

1. Potwierdź krótko (1-2 zdania) jakie wytyczne załadowano
2. Stosuj te wytyczne do bieżącego i kolejnych zadań w tej sesji
3. Przy tworzeniu/modyfikacji kodu klienta sprawdzaj zgodność z wczytanymi wytycznymi
