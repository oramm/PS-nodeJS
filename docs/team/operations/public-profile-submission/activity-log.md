# Public Profile Submission Activity Log

## 2026-02-20 13:05 - Link resend MVP + last event metadata

- Scope:
    - rozszerzenie create-link (`recipientEmail`, `sendNow`),
    - zapis ostatniego zdarzenia linku,
    - ekspozycja danych do UI.
- Files:
    - `src/persons/publicProfileSubmission/PublicProfileSubmissionRouters.ts`
    - `src/persons/publicProfileSubmission/PublicProfileSubmissionController.ts`
    - `src/persons/publicProfileSubmission/PublicProfileSubmissionRepository.ts`
    - `src/types/types.d.ts`
    - `src/persons/migrations/005_add_public_profile_submission_last_link_event.sql`
    - `docs/team/operations/post-change-checklist.md`
- Impact: `DB/API/Docs`
- Verification:
    - `yarn build` pass,
    - `jest` modułu auth pass,
    - reviewer subagent verdict `APPROVE`.

## 2026-02-19 18:20 - Public Profile Submission V1 bootstrap

- Scope:
    - pierwsze wdrożenie backend flow dla public profile submission.
- Impact: `DB/API`
- Notes:
    - szczegóły i rollout w `docs/team/operations/post-change-checklist.md`.
