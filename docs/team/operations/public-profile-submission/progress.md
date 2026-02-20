# Public Profile Submission Progress

## Current Status Snapshot

- Active phase: `LINK_RESEND_MVP`
- Last completed checkpoint: `PPS-2-LAST-LINK-EVENT-METADATA`
- Overall status: `BACKEND_READY_UI_WIRING_PENDING`
- Next checkpoint: `PPS-3-UI-VISIBILITY-AND-RESEND`

## Checkpoints

- `PPS-1-V1-BACKEND-FLOW` -> `DONE`
- `PPS-2-LAST-LINK-EVENT-METADATA` -> `DONE`
- `PPS-3-UI-VISIBILITY-AND-RESEND` -> `OPEN`

## Session Entries

## 2026-02-19 - Session 1 - V1 backend flow

### Completed

- Wdrożono moduł public profile submission (link/token, verify email code, draft, submit, review).
- Dodano endpointy staff i public.
- Dodano migrację `004_create_public_profile_submission_v1.sql`.

### Evidence

- Build/test modułu przechodziły w sesji wdrożeniowej.
- Szczegóły operacyjne: `docs/team/operations/post-change-checklist.md`.

## 2026-02-20 - Session 2 - Link resend MVP + last event metadata

### Completed

- Rozszerzono create-link o `recipientEmail` i `sendNow`.
- Dodano wysyłkę maila linku oraz fallback na e-mail osoby.
- Dodano zapis i ekspozycję `lastLink*` w search/details.
- Dodano migrację `005_add_public_profile_submission_last_link_event.sql`.
- Uzupełniono wpis w `post-change-checklist`.

### Evidence

- `yarn build` -> pass.
- `yarn jest src/persons/publicProfileSubmission/__tests__/PublicProfileSubmissionAuth.test.ts --runInBand` -> pass.
- Mandatory reviewer subagent -> `APPROVE`.

### Risks / Notes

- UI nadal musi pokazać operatorowi „do kogo i kiedy poszło ostatnio”.
- Brak pełnej historii prób jest decyzją świadomą (MVP uproszczone).

### Next

- Dodać widok i akcję resend po stronie UI (`PPS-3`).
