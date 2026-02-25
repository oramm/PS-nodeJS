# Contract Meeting Notes Plan

## Purpose

One canonical implementation plan for the full flow: meeting -> agenda -> note document -> future case history events.

## Canonical Documentation Set

All active documentation for this initiative is maintained only in:

- `documentation/team/operations/contract-meeting-notes/plan.md`
- `documentation/team/operations/contract-meeting-notes/progress.md`
- `documentation/team/operations/contract-meeting-notes/activity-log.md`

Legacy files outside this folder are pointers only.

## Context biznesowy i cel

Primary business goal is to improve meeting operations and future searchability of case-related history.
Target user flow is:

1. user creates meeting,
2. user creates agenda by selecting existing cases and/or creating case ad hoc,
3. user creates meeting note document generated from template,
4. agenda and discussed cases become visible in case event history (implementation of search may be later, but data model and links must be ready now).

## Ustalenia zamrożone

1. Architecture MUST stay: Router -> Controller -> Repository -> Model.
2. Transactions are managed only by Controller.
3. No DB I/O in Model.
4. Agenda is implemented through `MeetingArrangements` (no separate `Agenda` table).
5. `MeetingArrangement` statuses: `PLANNED -> DISCUSSED -> CLOSED`.
6. No agenda/arrangement item without linked `Case`.
7. `ContractMeetingNote` must be linked 1:1 with `Meeting` (`meetingId` required, unique relation).
8. Note document generation uses flow analogous to OurLetter/OurOffer with `ToolsGd` + `ToolsDocs`.
9. Stage 1 implementation: no Google Apps Script dependency.
10. Stage 2 (optional): GScript automation as extension without changing core contracts.
11. Folder naming standard for new writes: `Notatki ze spotkań`.
12. Find/search pattern: `POST` + `body.orConditions`.
13. Search is metadata-only DB in current scope.

### Zamrożone decyzje UI (P1–P5) — sesja plannerska 2026-02-24

- P1: Case w punkcie agendy: **wymagany** (hard constraint).
- P2: Pusta agenda: **UI blokuje** przycisk "Generuj notatkę" (backend nie waliduje).
- P3: Zmiana statusu MeetingArrangement: **dedykowany button** w action menu (nie w edit modal).
- P4: Przycisk "Generuj notatkę": **pod tabelą agendy** w panelu spotkania.
- P5: CaseSelector: **użyj istniejącego** `CaseSelectMenuElement` z `BussinesObjectSelectors.tsx` z `_contract` prop.

## Plan implementacji serwer + klient (bez fazowania)

1. Stabilize backend contracts for meetings, arrangements, and meeting notes with explicit `meetingId` linkage.
2. Enforce 1:1 `Meeting` <-> `ContractMeetingNote` in service logic and DB constraints.
3. Implement/complete backend create/update flow for arrangements with status transition validation.
4. Support ad hoc case creation inside meeting workflow through reusable case creation logic, then immediate arrangement link.
5. Implement note generation orchestration in controller:
    - prepare context data (meeting + arrangements + contract),
    - create/copy document via `ToolsGd`,
    - populate template sections via `ToolsDocs`.
6. Persist note metadata and document references in `ContractMeetingNotes` with required `meetingId`.
7. Extend case events payload to include meeting-discussion context and note link metadata.
8. Implement/update frontend workflow as one coherent process:
    - meeting lifecycle,
    - agenda editing and status updates,
    - one action to create/open note for meeting,
    - consistent view of discussed items and context.
9. Keep client logic thin; all domain rules remain server-side.
10. Add regression-safe tests for critical paths and constraints.

## Kryteria akceptacji

1. Every meeting can have at most one active note.
2. Note creation always results in valid meeting link (`meetingId`).
3. Agenda items have required case linkage.
4. Status transitions enforce `PLANNED -> DISCUSSED -> CLOSED`.
5. Generated note document contains agenda data from arrangements.
6. Case event payload exposes meeting-discussion context and note reference metadata.
7. Build/tests pass for touched backend and frontend modules.

## YAML Kontrakty implementacyjne

### N5A-BACKEND-GAPS

```yaml
task_id: N5A-BACKEND-GAPS
scope: server
arch_layers_touched: [Router, Validator, Controller, Repository, Model, DB-migration]

technical_objectives:
  - objective: "DB migration 002 — kolumna Status (PLANNED/DISCUSSED/CLOSED) w MeetingArrangements"
    constraints: "ENUM lub VARCHAR CHECK. Default=PLANNED. Nullable=false. Nie zmieniaj innych kolumn."
  - objective: "POST /meetings (find wg orConditions) + POST /meeting (create/edit/delete)"
    constraints: |
      Pattern: POST + orConditions jak contractMeetingNotes.
      Validator wymagany (MeetingValidator).
      contractId wymagany przy create.
      Thin router — walidacja w Controller.
  - objective: "POST /meetingArrangements (find) + POST /meetingArrangement (create/edit/delete)"
    constraints: |
      Pattern POST + orConditions.
      Validator wymagany (MeetingArrangementValidator).
      Status transitions: tylko do przodu (PLANNED->DISCUSSED->CLOSED).
      Controller waliduje kierunek zmiany statusu — błąd 400 przy cofaniu.
      caseId wymagany przy create (hard constraint).
  - objective: "ContractMeetingNote: meetingId w create DTO + edit + delete endpoints"
    constraints: |
      meetingId opcjonalny przy create (UI przekazuje, backend przyjmuje).
      Validator zaktualizowany o meetingId.
      edit i delete w router (PUT /contractMeetingNote, DELETE /contractMeetingNote/:id).

verification_criteria:
  hard:
    - "yarn build przechodzi"
    - "yarn test src/meetings src/contractMeetingNotes przechodzi"
    - "Migracja 002: kolumna Status z domyślną wartością PLANNED"
    - "PUT /meetingArrangement z Status=PLANNED gdy current=DISCUSSED -> 400"
    - "POST /meetingArrangement bez caseId -> 400"
    - "DELETE /contractMeetingNote/:id -> 200 i usunięty rekord"
  soft:
    - "src/types/types.d.ts zaktualizowane dla Status i nowych DTO"
```

### N5B-BACKEND-NOTE-GEN

```yaml
task_id: N5B-BACKEND-NOTE-GEN
scope: server
arch_layers_touched: [Controller, ToolsDocs-extension]

technical_objectives:
  - objective: "Szablon GD (meetingProtocoTemlateId) używa znaczników #ENVI#NAZWA#"
    constraints: |
      Wymagane zmienne w szablonie:
        #ENVI#MEETING_TITLE#, #ENVI#MEETING_DATE#, #ENVI#MEETING_LOCATION#,
        #ENVI#CONTRACT_NUMBER#, #ENVI#CREATED_BY#, #ENVI#AGENDA_SECTION#
  - objective: "ContractMeetingNotesController wywołuje ToolsDocs po skopiowaniu pliku"
    constraints: |
      Flow: copyFile -> initNamedRangesFromTags -> updateTextRunsInNamedRanges (metadane)
            -> insertAgendaStructure (H2 + paragraf Normal per arrangement)
      Rollback (trash GD file) przy błędzie DB.
  - objective: "Wstawienie agendy jako Heading2 + paragraf Normal w dokumencie GD"
    constraints: |
      Każdy MeetingArrangement -> Heading2(nazwa/opis) + pusty Paragraph (Normal style).
      Implementacja przez Google Docs batchUpdate.
      NIE modyfikuj istniejących publicznych metod ToolsDocs.
  - objective: "Controller pobiera MeetingArrangements dla meetingId przed generowaniem dokumentu"
    constraints: |
      Pobieranie przez MeetingArrangementRepository.find({ meetingId }).
      Sortowanie po kolejności dodania (id ASC).
      meetingId może być NULL -> wtedy bez agendy (pusta lista).
```

### N5C-FRONTEND-AGENDA

```yaml
task_id: N5C-FRONTEND-AGENDA
scope: client
arch_layers_touched: [UI-Components, Repository, TypeDefinitions]

technical_objectives:
  - objective: "Typy MeetingData i MeetingArrangementData (ze Status) w bussinesTypes.d.ts"
    constraints: "Status: 'PLANNED' | 'DISCUSSED' | 'CLOSED'."
  - objective: "meetingsRepository i meetingArrangementsRepository w ContractsController.ts"
    constraints: "Pattern identyczny jak meetingNotesRepository."
  - objective: "Tab 'Spotkania' z FilterableTable<MeetingData> — CRUD"
    constraints: |
      Nowy tab w ContractMainViewTabs.
      contractId z ContractDetailsContext.
      Formularz (add/edit modal): nazwa, data, lokalizacja.
  - objective: "MeetingAgendaPanel — FilterableTable<MeetingArrangementData> + CRUD + zmiana statusu"
    constraints: |
      Renders warunkowo gdy selectedMeeting jest ustawione.
      Add modal: CaseSelectMenuElement z _contract z kontekstu + opis (optional).
      Status change: dedykowany button w action menu (nie w edit modal).
      Transitions: tylko do przodu PLANNED->DISCUSSED->CLOSED.
  - objective: "Przycisk 'Generuj notatkę' — disabled gdy arrangements=0"
    constraints: |
      POST /contractMeetingNote z { meetingId, contractId, title }.
      Po sukcesie: link do GD dokumentu widoczny przy spotkaniu.
```

### N5D-FRONTEND-NOTES-EDIT

```yaml
task_id: N5D-FRONTEND-NOTES-EDIT
scope: client
arch_layers_touched: [UI-Components]

technical_objectives:
  - objective: "FilterableTable MeetingNotes: dodać EditButtonComponent + isDeletable=true"
    constraints: |
      Analogicznie do Tasks.tsx.
      Edit modal: title, meetingDate.
      isDeletable=true — usuwa rekord (nie plik GD).
```

### N6-FRONTEND-SEARCH

```yaml
task_id: N6-FRONTEND-SEARCH
scope: client
arch_layers_touched: [UI-Components]

technical_objectives:
  - objective: "MeetingsFilterBody component for Meetings FilterableTable"
    constraints: |
      Pattern: follow TasksFilterBody.tsx (useFormContext + register, Row/Col/Form.Group).
      Fields: searchText (text input).
      contractId auto-injected — no filter field needed.
      Meetings.tsx: add FilterBodyComponent={MeetingsFilterBody}.
  - objective: "MeetingNotesFilterBody component for MeetingNotes FilterableTable"
    constraints: |
      Pattern: follow TasksFilterBody.tsx.
      Fields: searchText (title), meetingDateFrom, meetingDateTo.
      MeetingNotes.tsx: add FilterBodyComponent={MeetingNotesFilterBody}.

verification_criteria:
  hard:
    - "FilterBody renders inside both FilterableTables"
    - "Date filters send correct params to backend POST"
    - "Frontend build passes (tsc --noEmit)"
  soft:
    - "Polish labels consistent with existing UI"
```

### N6B-UI-MERGE (zmiana scope — decyzja usera)

```yaml
task_id: N6B-UI-MERGE
scope: client
arch_layers_touched: [UI-Components]

technical_objectives:
  - objective: "Merge tabs: usunac osobny tab 'Notatki ze spotkan', notatka wbudowana w panel spotkania"
    constraints: |
      ContractMainViewTabs.tsx: usunac tab 'Notatki ze spotkan'.
      MeetingAgendaPanel.tsx: dodac MeetingNoteSection pod przyciskiem 'Generuj notatke'.
      MeetingNoteSection.tsx (NEW): fetch notatki po meetingId, link GD, edit/delete.
      Backend bez zmian.

verification_criteria:
  hard:
    - "Jeden tab 'Spotkania' z master-detail: lista spotkan -> agenda + notatka"
    - "tsc --noEmit pass"
```

### N7-STABILIZATION-ROLLOUT

```yaml
task_id: N7-STABILIZATION-ROLLOUT
scope: server + client
arch_layers_touched: [Repository, Controller, Tests]

technical_objectives:
  - objective: "Extend CaseEventRepository SQL to LEFT JOIN ContractMeetingNotes"
    constraints: |
      New SELECT cols: NoteProtocolGdId, NoteTitle.
      CaseEventsController: attach _noteDocumentUrl on MeetingArrangement items.
      No new tables, no migrations.
  - objective: "Regression tests for status transitions"
    constraints: |
      PLANNED->DISCUSSED: 200, DISCUSSED->CLOSED: 200.
      DISCUSSED->PLANNED: 400, CLOSED->DISCUSSED: 400.
  - objective: "Regression tests for note generation + case events"
  - objective: "Runtime bugfixes"
    constraints: |
      FormContext import fix (MeetingModalBody, MeetingArrangementModalBody).
      _case object extraction in MeetingArrangementsController (caseId, name from _case).
      Graceful handling of missing #ENVI# tags in GD template.

verification_criteria:
  hard:
    - "yarn build + yarn test pass (server)"
    - "tsc --noEmit pass (client)"
    - "CaseEvents return _noteDocumentUrl on MeetingArrangement events"
    - "Backwards status transitions return 400"
  soft:
    - "progress.md + activity-log.md updated"
```

## Flow UI (master-detail) — zaktualizowany

```
CONTRACT DETAILS
└── Tab: "Spotkania"
    ├── FilterableTable<MeetingData> — CRUD + MeetingsFilterBody
    └── [onRowClick -> selectedMeeting]
          ▼ Panel: "Spotkanie: {nazwa} ({data})"
          ├── FilterableTable<MeetingArrangementData> — CRUD
          │     kolumny: sprawa (z _typeFolderNumber_TypeName_Number_Name), opis, status
          │     + Dodaj punkt (modal: CaseSelectMenuElement + opis)
          │     ✏️ Edit | ▶ Status | 🗑️ Delete (action menu)
          ├── Przycisk: "Generuj notatkę ze spotkania" (disabled gdy brak arrangements)
          └── MeetingNoteSection (link GD, edit/delete metadanych)
```

## Session Contract (clean context workflow)

Every implementation session must:

1. read this plan,
2. read progress,
3. read activity log,
4. apply `.github/instructions/*` architecture and environment rules,
5. update progress + activity log at session end,
6. update `documentation/team/operations/post-change-checklist.md` and `.env.example` for DB/env/deploy changes.

## Prompt For Next Session

Start nowej sesji dla feature: Contract Meeting Notes (serwer + klient).

Kontekst obowiazkowy:

1. `documentation/team/operations/contract-meeting-notes/plan.md`
2. `documentation/team/operations/contract-meeting-notes/progress.md`
3. `documentation/team/operations/contract-meeting-notes/activity-log.md`
4. `documentation/team/architecture/clean-architecture.md`
5. `documentation/team/architecture/clean-architecture-details.md`
6. `documentation/team/architecture/testing-per-layer.md`
7. `documentation/team/architecture/refactoring-audit.md`
8. `documentation/team/architecture/ai-decision-trees.md`
9. `documentation/team/architecture/auth-migration.md`
10. `.github/instructions/srodowiska.instructions.md`
