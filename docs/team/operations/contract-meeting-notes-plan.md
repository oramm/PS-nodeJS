# Contract Meeting Notes Plan

## Purpose

Execution plan for introducing contract meeting notes generated from Google Docs templates, with metadata stored in DB and searchable in system.

## Session Contract (clean context workflow)

Every new session must start with:

1. Read this file: `docs/team/operations/contract-meeting-notes-plan.md`.
2. Read status file: `docs/team/operations/contract-meeting-notes-progress.md`.
3. Read latest activity entries: `docs/team/operations/contract-meeting-notes-activity-log.md`.
4. Read and apply project instructions from `.github/instructions/*` (mandatory).
5. Execute only the first OPEN checkpoint from the list below.
6. At session end, update progress and activity-log files.

## Non-Negotiable Rules

1. Keep architecture rules:

- Router -> Controller -> Repository -> Model
- transactions in Controller
- no DB I/O in Model

2. Folder name standard is `Notatki ze spotkań`.
3. Legacy runtime naming (`Notatki ze spotkan`) can exist, but new writes should use the standard above.
4. "Nie uzywac" removal is backend scope only.
5. Find/search uses project pattern: POST + `body.orConditions`.
6. Search is metadata-only (DB), no Google Docs full-text in this stage.
7. Numbering is sequence per contract and must be transaction-safe.
8. For DB/env/deploy-impacting changes:

- update `docs/team/operations/post-change-checklist.md`
- update `.env.example` when env keys change
- complete `.github/PULL_REQUEST_TEMPLATE.md` checklist

## Project Guidelines (mandatory references)

1. `.github/instructions/architektura.instructions.md`
2. `.github/instructions/architektura-szczegoly.md`
3. `.github/instructions/architektura-testowanie.md`
4. `.github/instructions/architektura-refactoring-audit.md`
5. `.github/instructions/architektura-ai-assistant.md`
6. `.github/instructions/refactoring-auth-pattern.md`
7. `.github/instructions/srodowiska.instructions.md`

## Target API/Interfaces

1. `POST /contractMeetingNotes` (find/list/search)
2. `POST /contractMeetingNote` (create)
3. Backend types (target):

- `ContractMeetingNoteData`
- `ContractMeetingNoteCreatePayload`
- `ContractMeetingNoteSearchParams`

4. Target field alignment for next code session:

- `ContractMeetingNoteData`: `meetingId?: number | null`
- `ContractMeetingNoteSearchParams`: `meetingId?: number`
- `ContractMeetingNoteCreatePayload`: no `meetingId` (backend-owned)

5. Find/list/search request payload:

```json
{
    "orConditions": [
        {
            "contractId": 123
        }
    ]
}
```

## Session Split (doc-first correction before next code checkpoints)

1. `S1-PLAN-CORRECTION` - align plan with current architecture direction.
   Acceptance criteria:

- Plan explicitly states linkage `ContractMeetingNotes -> Meetings` via `meetingId`.
- Plan states `MeetingArrangements` are target structure for arrangements per case.
- Plan states staged delivery: data-layer alignment now, parser/UI later.

2. `S2-PROGRESS-FACTUAL-CORRECTION` - add factual correction entry without rewriting history.
   Acceptance criteria:

- Progress explicitly states migration `001` has not been executed yet.
- Status is corrected to "code complete / migration pending".

3. `S3-ACTIVITY-LOG-ALIGNMENT` - add architecture-decision and staging entries.
   Acceptance criteria:

- Activity log captures why direction is corrected and what changes next.

4. `S4-OPERATIONS-CHECKLIST-UPDATE` - add explicit DB apply gate.
   Acceptance criteria:

- Checklist states SQL is not applied yet and defines preconditions before N4/N5.

## Checkpoints

1. `N0-BOOTSTRAP` - docs bootstrap (this plan/progress/activity-log).
2. `N1-BACKEND-DISCOVERY` - verify existing schema/runtime objects and lock DB strategy (reuse/create).
   Acceptance criteria:

- Existing runtime/table objects are confirmed (or missing objects are listed).
- API style is locked to project pattern: `POST` find/list via `orConditions`.
- Integration points for "Nie uzywac" backend removal are identified with file-level scope.

3. `N2-BACKEND-DATA-LAYER` - migration (if needed), model, repository, numbering logic.
   Acceptance criteria:

- Data model + repository contract finalized for metadata-only search.
- Model/repository alignment includes `meetingId` linkage to `Meetings`.
- `ContractMeetingNoteSearchParams` is mapped to SQL condition strategy.
- Numbering per contract is specified as transaction-safe in Controller flow.

4. `N3-BACKEND-CREATE-ENDPOINT` - create endpoint with Google Docs copy flow.
   Acceptance criteria:

- `POST /contractMeetingNote` request/response contract is finalized.
- Controller transaction and error handling flow are defined.
- Required tests for create path are listed.

5. `N4-BACKEND-READ-ENDPOINTS` - list/search endpoints and backend activation of notes flow.
   Acceptance criteria:

- `POST /contractMeetingNotes` request/response contract is finalized.
- Filtering by `contractId` via `orConditions` is covered in tests.
- Search remains metadata-only and this is validated in tests/checks.

6. `N5-FRONTEND-LIST-CREATE` - add note button, create form/modal, notes list (frontend repository: `C:/Apache24/htdocs/ENVI.ProjectSite`, scope here = backend handoff/support only).
7. `N6-FRONTEND-SEARCH` - search UI and integration (frontend repository: `C:/Apache24/htdocs/ENVI.ProjectSite`, scope here = backend handoff/support only).
8. `N7-STABILIZATION-ROLLOUT` - regression checks, operational docs, rollout readiness.

## Definition of Done (overall)

1. Notes can be created from Google Docs template and linked to contract.
2. Notes metadata is linked to `Meetings` (`meetingId`) for future arrangements integration.
3. Metadata is persisted and searchable.
4. Contract-scoped notes list works in UI.
5. API contract follows project pattern for find/search (`POST` + `orConditions`).
6. Session continuity docs are complete and up to date.
7. Work is aligned with mandatory `.github/instructions/*` references.

## Prompt For Next Session (clean context, copy 1:1)

```text
Start nowej sesji dla feature: Contract Meeting Notes (backend).

Kontekst obowiazkowy (czytaj w tej kolejnosci):
1) docs/team/operations/contract-meeting-notes-plan.md
2) docs/team/operations/contract-meeting-notes-progress.md
3) docs/team/operations/contract-meeting-notes-activity-log.md
4) .github/instructions/architektura.instructions.md
5) .github/instructions/architektura-szczegoly.md
6) .github/instructions/architektura-testowanie.md
7) .github/instructions/architektura-refactoring-audit.md
8) .github/instructions/architektura-ai-assistant.md
9) .github/instructions/refactoring-auth-pattern.md
10) .github/instructions/srodowiska.instructions.md

Zasady wykonania:
- Wykonaj tylko pierwszy OPEN checkpoint z planu.
- Dla find/search trzymaj wzorzec projektu: POST + body.orConditions.
- Architektura MUST: Router -> (Validator) -> Controller -> Repository -> Model.
- Transakcje tylko w Controller.
- Brak DB I/O w Model.
- Search tylko po metadata DB.
- Na koniec sesji obowiazkowo zaktualizuj:
  - docs/team/operations/contract-meeting-notes-progress.md
  - docs/team/operations/contract-meeting-notes-activity-log.md
- Jesli zmiany obejmuja DB/env/deploy, zaktualizuj:
  - docs/team/operations/post-change-checklist.md
  - .env.example
  - checkliste PR w .github/PULL_REQUEST_TEMPLATE.md

Wynik sesji:
- krotki raport: co zrobiono, evidence (test/build/grep), ryzyka, dokladny next step.
```
