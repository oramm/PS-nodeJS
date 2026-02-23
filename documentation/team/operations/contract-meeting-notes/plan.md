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
