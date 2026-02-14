# HR Module Progress

## How to Use

1. Append one entry after each implementation session.
2. Keep entries factual and evidence-based.
3. Never rewrite old entries except to fix factual mistakes.
4. Next session must start by reading this file + plan file.
5. LLM MUST auto-update this file at end of session (mandatory).

Plan reference: `docs/team/operations/hr-module-plan.md`

## Current Status

- Następna sesja: DONE
- Ostatnia zakończona: 3
- Overall status: SESSION_3_CLOSED

## Session Log

### 2026-02-13 - Sesja 1 - Education CRUD

#### Scope
- Aktywacja szkieletu PersonProfileEducations jako osobny sub-moduł
- Model + Repository + Controller + Router + Testy
- Integracja z getPersonProfileV2()

#### Completed
- Dodano typy `PersonProfileEducationV2Payload`, `PersonProfileEducationV2Record` w `src/types/types.d.ts`
- Utworzono model `src/persons/educations/PersonProfileEducation.ts`
- Utworzono repository `src/persons/educations/EducationRepository.ts` z custom SQL (find, add, edit, delete) + ensurePersonProfileId helper
- Utworzono controller `src/persons/educations/EducationController.ts` (Singleton, transakcje w ToolsDb.transaction)
- Utworzono router `src/persons/educations/EducationRouters.ts` (4 endpointy REST: GET/POST/PUT/DELETE)
- Zarejestrowano router w `src/index.ts`
- Zaktualizowano `PersonsController.getPersonProfileV2()` aby zwracał `profileEducations`
- Utworzono testy `src/persons/educations/__tests__/EducationController.test.ts` (5 testów)
- Utworzono pliki plan/progress w `docs/team/operations/`

#### Evidence
- `yarn build` → OK (0 errors)
- `yarn test --testPathPatterns=educations` → 5/5 PASS
- `yarn test` (all) → 8/10 suites passed, 33/39 tests passed. 2 failed suites are pre-existing (OffersController: missing REFRESH_TOKEN env var)
- Nowe pliki:
    - `src/persons/educations/PersonProfileEducation.ts`
    - `src/persons/educations/EducationRepository.ts`
    - `src/persons/educations/EducationController.ts`
    - `src/persons/educations/EducationRouters.ts`
    - `src/persons/educations/__tests__/EducationController.test.ts`
- Zmienione pliki:
    - `src/types/types.d.ts` (+2 interfejsy)
    - `src/persons/PersonsController.ts` (+import EducationController, zmiana getPersonProfileV2)
    - `src/index.ts` (+require EducationRouters)

#### Endpointy
| Metoda | Endpoint | Status |
|--------|----------|--------|
| GET | `/v2/persons/:personId/profile/educations` | ACTIVE |
| POST | `/v2/persons/:personId/profile/educations` | ACTIVE |
| PUT | `/v2/persons/:personId/profile/educations/:educationId` | ACTIVE |
| DELETE | `/v2/persons/:personId/profile/educations/:educationId` | ACTIVE |

#### Next
- Następna sesja: 2 (Skills Dictionary + PersonProfileSkills CRUD)
- Blokery: brak

### 2026-02-14 - Sesja 2 - Skills Dictionary + PersonProfileSkills CRUD

#### Scope
- Aktywacja SkillsDictionary jako osobny mini-moduł (Repository, Controller, Router)
- Aktywacja PersonProfileSkills jako osobny sub-moduł (Model, Repository, Controller, Router)
- Integracja z getPersonProfileV2()
- Testy jednostkowe obu modułów

#### Completed
- Dodano typy `SkillDictionaryPayload`, `SkillDictionaryRecord`, `PersonProfileSkillV2Payload`, `PersonProfileSkillV2Record` w `src/types/types.d.ts`
- Utworzono repository `src/persons/skills/SkillsDictionaryRepository.ts` z normalizeName(), find (z searchText LIKE), add, edit, delete
- Utworzono controller `src/persons/skills/SkillsDictionaryController.ts` (Singleton, transakcje)
- Utworzono router `src/persons/skills/SkillsDictionaryRouters.ts` (4 endpointy REST)
- Utworzono model `src/persons/profileSkills/PersonProfileSkill.ts` (extends BusinessObject)
- Utworzono repository `src/persons/profileSkills/ProfileSkillRepository.ts` z JOIN SkillsDictionary, ensurePersonProfileId helper
- Utworzono controller `src/persons/profileSkills/ProfileSkillController.ts` (Singleton, transakcje)
- Utworzono router `src/persons/profileSkills/ProfileSkillRouters.ts` (4 endpointy REST)
- Zarejestrowano oba routery w `src/index.ts`
- Zaktualizowano `PersonsController.getPersonProfileV2()` aby zwracał `profileSkills` (Promise.all z 3 zapytaniami)
- Utworzono testy `src/persons/skills/__tests__/SkillsDictionaryController.test.ts` (4 testy)
- Utworzono testy `src/persons/profileSkills/__tests__/ProfileSkillController.test.ts` (5 testów)

#### Evidence
- `yarn build` → OK (0 errors)
- `yarn test` (all) → 10/12 suites passed, 43/46 tests passed. 2 failed suites are pre-existing (ContractsController, OffersController - not related to this session)
- Nowe pliki:
    - `src/persons/skills/SkillsDictionaryRepository.ts`
    - `src/persons/skills/SkillsDictionaryController.ts`
    - `src/persons/skills/SkillsDictionaryRouters.ts`
    - `src/persons/skills/__tests__/SkillsDictionaryController.test.ts`
    - `src/persons/profileSkills/PersonProfileSkill.ts`
    - `src/persons/profileSkills/ProfileSkillRepository.ts`
    - `src/persons/profileSkills/ProfileSkillController.ts`
    - `src/persons/profileSkills/ProfileSkillRouters.ts`
    - `src/persons/profileSkills/__tests__/ProfileSkillController.test.ts`
- Zmienione pliki:
    - `src/types/types.d.ts` (+4 interfejsy)
    - `src/persons/PersonsController.ts` (+import ProfileSkillController, zmiana getPersonProfileV2 na 3 Promise.all)
    - `src/index.ts` (+require SkillsDictionaryRouters, ProfileSkillRouters)

#### Endpointy
| Metoda | Endpoint | Opis | Status |
|--------|----------|------|--------|
| GET | `/v2/skills` | Lista skills (query: searchText) | ACTIVE |
| POST | `/v2/skills` | Dodaj skill | ACTIVE |
| PUT | `/v2/skills/:skillId` | Edytuj nazwę | ACTIVE |
| DELETE | `/v2/skills/:skillId` | Usuń (fails if in use) | ACTIVE |
| GET | `/v2/persons/:personId/profile/skills` | Lista skills osoby | ACTIVE |
| POST | `/v2/persons/:personId/profile/skills` | Przypisz skill | ACTIVE |
| PUT | `/v2/persons/:personId/profile/skills/:skillEntryId` | Edytuj przypisanie | ACTIVE |
| DELETE | `/v2/persons/:personId/profile/skills/:skillEntryId` | Usuń przypisanie | ACTIVE |

#### Next
- Następna sesja: 3 (Rozszerzone wyszukiwanie + skills na liście osób)
- Blokery: brak

### 2026-02-14 - Sesja 3 - Rozszerzone wyszukiwanie + skills na liście osób

#### Scope
- Filtrowanie po skillach (`skillIds`) i profilu (`hasProfile`) w PersonsSearchParams
- Skills w GROUP_CONCAT na liście osób (`_skillNames`)
- Wyszukiwanie tekstowe po nazwach skilli w `makeSearchTextCondition()`
- Testy jednostkowe nowych filtrów i mapowania

#### Completed
- Rozszerzono `PersonsSearchParams` o `skillIds?: number[]` i `hasProfile?: boolean`
- Rozszerzono `makeAndConditions()` o EXISTS subquery dla `skillIds` (filtrowanie: osoba ma DOWOLNY z podanych skilli) oraz EXISTS dla `hasProfile`
- Dodano GROUP_CONCAT subquery do `findV2()` i `findLegacy()` zwracającą `SkillNames` (DISTINCT, ORDER BY Name)
- Dodano pole `_skillNames?: string` do `Person.ts` (model) z mapowaniem w konstruktorze
- Zaktualizowano `mapRowToModel()` w `PersonRepository.ts` o `_skillNames: row.SkillNames ?? undefined`
- Rozszerzono `makeSearchTextCondition()` o EXISTS subquery szukającą po `sd.Name LIKE '%word%'` w SkillsDictionary
- Utworzono testy `src/persons/__tests__/PersonRepository.search.test.ts` (14 testów w 5 grupach)

#### Evidence
- `yarn build` → OK (0 errors)
- `yarn test --testPathPatterns=PersonRepository.search` → 14/14 PASS
- `yarn test` (all) → 11/13 suites passed, 57/63 tests passed. 2 failed suites are pre-existing (OffersController: missing REFRESH_TOKEN, ContractsController: unrelated mock issue - same as Session 2)
- Nowe pliki:
    - `src/persons/__tests__/PersonRepository.search.test.ts`
- Zmienione pliki:
    - `src/persons/PersonRepository.ts` (PersonsSearchParams +2 pola, makeAndConditions +skillIds/hasProfile, findV2/findLegacy +GROUP_CONCAT, mapRowToModel +_skillNames, makeSearchTextCondition +skill search)
    - `src/persons/Person.ts` (+_skillNames field)

#### Testy (14 testów)
| Grupa | Ilość | Opis |
|-------|-------|------|
| makeAndConditions – skillIds | 4 | single/multiple skillIds, empty array, undefined |
| makeAndConditions – hasProfile | 2 | true generates EXISTS, false skips |
| makeAndConditions – combined | 2 | skillIds+hasProfile, skillIds+searchText |
| makeSearchTextCondition – skills | 4 | single word, multi-word, original fields preserved, empty |
| mapRowToModel – _skillNames | 2 | maps SkillNames, null → undefined |

#### Next
- Następna sesja: DONE (wszystkie 3 sesje backendowe zakończone)
- Blokery: brak
- Następny krok: Frontend (ENVI.ProjectSite) - osobny plan
