# Experience Update - Activity Log

## 2026-02-20 14:10 - Doc-first Gate kickoff (server + client)

- Scope:
    - rozpoczecie obowiazkowej fazy dokumentacyjnej przed implementacja,
    - synchronizacja nazewnictwa na `experience-updates` i `experience-update`,
    - zapisanie finalnych decyzji procesu: `1 profil = 1 aktywny link`, hard cut API, review `uzupelnij braki`.
- Files (server):
    - `docs/team/operations/public-profile-submission/plan.md`
    - `docs/team/operations/public-profile-submission/progress.md`
    - `docs/team/operations/public-profile-submission/activity-log.md`
    - `docs/team/runbooks/public-profile-submission-link-recovery.md`
    - `docs/team/operations/post-change-checklist.md`
- Impact: `Docs/Process`

## 2026-02-20 16:20 - Hard cut implementation (server + client)

- Scope:
    - hard-cut endpointow na `experience-updates`/`experience-update`,
    - single active process per person,
    - `copyLink` + `lastDispatch` w DTO staff,
    - `REJECT` wymaga komentarza + feedback na itemach,
    - FE switch na nowe endpointy i pojedynczy stan procesu.
- Files (server):
    - `src/persons/publicProfileSubmission/PublicProfileSubmissionRouters.ts`
    - `src/persons/publicProfileSubmission/PublicProfileSubmissionController.ts`
    - `src/persons/publicProfileSubmission/PublicProfileSubmissionRepository.ts`
    - `src/persons/publicProfileSubmission/PublicProfileSubmissionErrors.ts`
    - `src/persons/migrations/006_experience_update_hard_cut.sql`
    - `.env.example`
    - `src/types/types.d.ts`
- Impact: `API/DB/Env/Docs`
- Verification:
    - `PS-nodeJS`: `yarn build` pass, `yarn jest src/persons/publicProfileSubmission/__tests__/PublicProfileSubmissionAuth.test.ts --runInBand` pass,
    - `ENVI.ProjectSite`: `yarn tsc --noEmit` pass, `yarn build` pass.