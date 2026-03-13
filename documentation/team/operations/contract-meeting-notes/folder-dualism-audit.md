# Folder Dualism Audit For Contract Meeting Notes

## Decision

- Source of truth for newly created meeting-note files is the contract-scoped folder `Notatki ze spotkań`.
- `cases` and `meetings` stay as domain/context structures and may continue to own agenda, arrangements, and case folders, but they do not decide the storage location of `contractMeetingNotes` documents.
- Existing contracts with a saved `MeetingProtocolsGdFolderId` remain backward compatible and continue using that saved folder.

## Audit Findings

- `src/contracts/Contract.ts`
  - Creates the contract root folder.
  - Also creates `Notatki ze spotkań`.
  - Before this change, the meeting-notes folder was created under the project folder, not under the contract folder.
- `src/contractMeetingNotes/ContractMeetingNotesController.ts`
  - Uses `MeetingProtocolsGdFolderId` if present.
  - Before this change, missing folder fallback also created `Notatki ze spotkań` under the project folder.
- `src/contracts/milestones/cases/Case.ts`
  - Creates milestone/case-type/case folders for contract process handling.
  - These folders are tied to milestone/case workflow and are not a stable storage target for all contract meeting notes.
- `src/meetings/*`
  - Holds meeting records, arrangements, and protocol links.
  - Does not define a separate canonical contract-level folder structure for `contractMeetingNotes`.

## Chosen Rule

1. If `Contracts.MeetingProtocolsGdFolderId` exists, use it.
2. Otherwise create or recover `Notatki ze spotkań` under `Contracts.GdFolderId`.
3. Do not fall back to `Projects.GdFolderId` for new meeting-note storage.

## Compatibility Notes

- This change is intentionally forward-looking.
- It does not migrate old `MeetingProtocolsGdFolderId` values.
- It removes silent project-level fallback for new cases, so missing contract folder state now fails loudly.
