# Plan: Moduł HR - Backend (PS-nodeJS)

## Context

Firma świadczy usługi konsultingowe i nadzoru inwestorskiego - sprzedaje wiedzę i doświadczenie swoich ludzi. Obecny moduł persons to tylko książka kontaktowa. Potrzebny jest moduł HR pozwalający zarządzać specjalizacjami, doświadczeniem zawodowym i wykształceniem personelu.

Refactoring Persons V2 (P1-P4) przygotował strukturę DB - tabele `PersonProfileEducations`, `SkillsDictionary`, `PersonProfileSkills` istnieją jako szkielety (schema-only, bez kodu). Ten plan aktywuje je.

**Repo**: PS-nodeJS (ten plan)
**Frontend** (ENVI.ProjectSite): planowany osobno po zakończeniu backendu
**Nazewnictwo**: zachowujemy "skills" w API/DB

---

## Zasady nadrzędne (stosuj w każdej sesji)

1. **Clean Architecture MUST**: Router → (Validator) → Controller → Repository → Model
2. **Transakcje** tylko w Controller (`ToolsDb.transaction()`), nie w Repository
3. **Model** bez DB I/O
4. **Testowanie per warstwa**: Model = unit tests, Repository = integration (skipped), Controller = unit z mockami. Wzór: `src/offers/__tests__/`
5. **Mock pattern**: `jest.mock('../../BussinesObject')`, manual mocks w `__mocks__/`
6. Po refaktorze warstw CRUD/repository/model → uruchom skill `refactoring-audit`
7. Zmiany env/DB/deploy → zaktualizuj `.env.example` i `docs/team/operations/post-change-checklist.md`
8. W PR domknij checklistę `.github/PULL_REQUEST_TEMPLATE.md`
9. Nowe entry points wywołują `loadEnv()`
10. Po każdej sesji **OBOWIĄZKOWO** zaktualizuj `docs/team/operations/hr-module-progress.md`

**Pliki referencyjne architektoniczne** (`.github/instructions/`):
- `architektura.instructions.md` - reguły Clean Architecture
- `architektura-testowanie.md` - wytyczne testowania per warstwa
- `architektura-refactoring-audit.md` - checklist audytu po refaktorze
- `architektura-ai-assistant.md` - decision trees dla AI

---

## Kontrakt sesji (obowiązkowy)

### Pliki referencyjne
- **Plan**: `docs/team/operations/hr-module-plan.md` (kopia tego planu)
- **Progress**: `docs/team/operations/hr-module-progress.md`

### Workflow nowej sesji
1. Przeczytaj plan: `docs/team/operations/hr-module-plan.md`
2. Przeczytaj progress: `docs/team/operations/hr-module-progress.md`
3. Wykonaj TYLKO swoją sesję (pierwszą OPEN z listy)
4. Na koniec sesji zaktualizuj plik progress z wynikami

### Plik progress - struktura
```md
# HR Module Progress

## Current Status
- Następna sesja: <1|2|3|DONE>
- Ostatnia zakończona: <none|1|2|3>

## Session Log

### YYYY-MM-DD - Sesja N - <tytuł>
#### Scope
- Zaplanowane zadania: ...

#### Completed
- Co zrobiono: ...

#### Evidence
- `yarn test` → PASS/FAIL
- `yarn build` → OK/FAIL
- Zmienione pliki: ...

#### Next
- Następna sesja: <N+1> lub DONE
- Blokery: <brak | opis>
```

---

## Sesja 1: Education CRUD (osobny moduł)

**Scope**: Aktywacja szkieletu `PersonProfileEducations` - osobny Model/Repository/Controller/Router.
**Wzorzec**: Analogiczny do `src/persons/projectRoles/` (osobny sub-moduł w persons).
**Lokalizacja**: `src/persons/educations/`

### 1.1 Typy TypeScript
**Plik**: `src/types/types.d.ts` - dodać:
```typescript
export interface PersonProfileEducationV2Payload {
    schoolName?: string;
    degreeName?: string;
    fieldOfStudy?: string;
    dateFrom?: string;
    dateTo?: string;
    sortOrder?: number;
}
export interface PersonProfileEducationV2Record extends PersonProfileEducationV2Payload {
    id: number;
    personProfileId: number;
}
```

### 1.2 Model
**Nowy plik**: `src/persons/educations/PersonProfileEducation.ts`
- Extends BusinessObject
- Pola: id, personProfileId, schoolName, degreeName, fieldOfStudy, dateFrom, dateTo, sortOrder
- Konstruktor z initParams

### 1.3 Repository
**Nowy plik**: `src/persons/educations/EducationRepository.ts`
- Extends BaseRepository, tableName = `PersonProfileEducations`
- `mapRowToModel(row)` → `PersonProfileEducation`
- `find(personId)` → SELECT z JOIN PersonProfiles, ORDER BY SortOrder, Id
- `addInDb(personId, education, conn)` → INSERT. Potrzebuje helper `ensurePersonProfileId()` - wyekstrahować ze współdzielonego helpera lub zduplikować (prywatna metoda)
- `editInDb(personId, educationId, education, conn)` → UPDATE
- `deleteFromDb(personId, educationId, conn)` → DELETE z JOIN
- `private getByIdInConn(conn, personId, educationId)` → helper

Kolumny DB (z `001_create_persons_v2_schema.sql` linia 65): SchoolName, DegreeName, FieldOfStudy, DateFrom, DateTo, SortOrder.

**Uwaga**: `ensurePersonProfileId(personId, conn)` jest prywatną metodą PersonRepository (linia 923). Opcje:
- a) Wyekstrahować do współdzielonego helpera (np. `src/persons/PersonProfileHelper.ts`)
- b) Zduplikować w EducationRepository (prostsze, mały helper)

### 1.4 Controller
**Nowy plik**: `src/persons/educations/EducationController.ts`
- Singleton (wzór BaseController)
- `find(personId)` → delegates to repository
- `addFromDto(personId, data)` → `ToolsDb.transaction()`, ensure profile exists
- `editFromDto(personId, educationId, data)` → `ToolsDb.transaction()`
- `deleteFromDto(personId, educationId)` → `ToolsDb.transaction()`, returns `{ id }`

### 1.5 Router
**Nowy plik**: `src/persons/educations/EducationRouters.ts`

| Metoda | Endpoint | Handler |
|--------|----------|---------|
| GET | `/v2/persons/:personId/profile/educations` | list |
| POST | `/v2/persons/:personId/profile/educations` | add |
| PUT | `/v2/persons/:personId/profile/educations/:educationId` | edit |
| DELETE | `/v2/persons/:personId/profile/educations/:educationId` | delete |

Payload: `schoolName`, `degreeName`, `fieldOfStudy`, `dateFrom`, `dateTo`, `sortOrder`.

**Zmiana**: `src/index.ts` - dodać `import './persons/educations/EducationRouters'`

### 1.6 Integracja z profilem
**Plik**: `src/persons/PersonsController.ts` - `getPersonProfileV2()` (linia 335)

Dodać `profileEducations` (import EducationController):
```typescript
const [profileExperiences, profileEducations] = await Promise.all([
    instance.repository.listPersonProfileExperiencesV2(personId),
    EducationController.find(personId),
]);
return { ...profile, profileExperiences, profileEducations };
```

### 1.7 Testy
**Nowy plik**: `src/persons/educations/__tests__/EducationController.test.ts`

Przypadki: list, add, edit, delete, integracja z getPersonProfileV2.

### Weryfikacja sesji 1
- `yarn test` - nowe testy PASS + istniejące niezłamane
- `yarn build` - kompilacja OK

---

## Sesja 2: Skills Dictionary + PersonProfileSkills CRUD

**Scope**: Aktywacja `SkillsDictionary` + `PersonProfileSkills`.
**Zależność**: Brak zależności od Sesji 1 (ale logicznie po niej).

### 2.1 Typy TypeScript
**Plik**: `src/types/types.d.ts`
```typescript
export interface SkillDictionaryPayload { name: string; }
export interface SkillDictionaryRecord extends SkillDictionaryPayload {
    id: number;
    nameNormalized: string;
}
export interface PersonProfileSkillV2Payload {
    skillId: number;
    levelCode?: string;
    yearsOfExperience?: number;
    sortOrder?: number;
}
export interface PersonProfileSkillV2Record extends PersonProfileSkillV2Payload {
    id: number;
    personProfileId: number;
    _skill?: SkillDictionaryRecord;
}
```

### 2.2 SkillsDictionary - osobny mini-moduł
**Nowe pliki**:

**`src/persons/skills/SkillsDictionaryRepository.ts`**
- Extends `BaseRepository`
- `find(searchParams?)` - lista, opcjonalny `searchText` (LIKE na Name)
- `mapRowToModel(row)` → `SkillDictionaryRecord`
- Helper `normalizeName(name)` - lowercase, trim, collapse whitespace → `NameNormalized`
- Na INSERT/UPDATE: walidacja unikalności (UNIQUE na Name i NameNormalized - DB wyrzuci błąd)

**`src/persons/skills/SkillsDictionaryController.ts`**
- Singleton (wzór BaseController)
- `find(searchParams?)`, `addFromDto(payload)`, `editFromDto(id, payload)`, `delete(id)`
- DELETE: FK RESTRICT na PersonProfileSkills → błąd jeśli skill w użyciu (poprawne zachowanie)

**`src/persons/skills/SkillsDictionaryRouters.ts`**

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/v2/skills` | Lista (do dropdownów). Query param `?searchText=` |
| POST | `/v2/skills` | Dodaj |
| PUT | `/v2/skills/:skillId` | Edytuj nazwę |
| DELETE | `/v2/skills/:skillId` | Usuń (fails if in use) |

**Zmiana**: `src/index.ts` - dodać `import './persons/skills/SkillsDictionaryRouters'`

### 2.3 PersonProfileSkills - osobny sub-moduł
**Lokalizacja**: `src/persons/profileSkills/`

**Nowy plik**: `src/persons/profileSkills/PersonProfileSkill.ts`
- Extends BusinessObject
- Pola: id, personProfileId, skillId, levelCode, yearsOfExperience, sortOrder, `_skill?: SkillDictionaryRecord`

**Nowy plik**: `src/persons/profileSkills/ProfileSkillRepository.ts`
- Extends BaseRepository, tableName = `PersonProfileSkills`
- `mapRowToModel(row)` → `PersonProfileSkill` (z JOIN: SkillName, SkillNameNormalized)
- `find(personId)` → SELECT z JOIN SkillsDictionary, PersonProfiles
- `addInDb(personId, skill, conn)` → INSERT, `ensurePersonProfileId()`, obsługa UNIQUE(PersonProfileId, SkillId)
- `editInDb(personId, skillEntryId, skill, conn)` → UPDATE (levelCode, yearsOfExperience, sortOrder - NIE skillId)
- `deleteFromDb(personId, skillEntryId, conn)` → DELETE

**Nowy plik**: `src/persons/profileSkills/ProfileSkillController.ts`
- Singleton, `find()`, `addFromDto()`, `editFromDto()`, `deleteFromDto()`
- Transakcje w Controller

**Nowy plik**: `src/persons/profileSkills/ProfileSkillRouters.ts`

| Metoda | Endpoint | Handler |
|--------|----------|---------|
| GET | `/v2/persons/:personId/profile/skills` | list |
| POST | `/v2/persons/:personId/profile/skills` | add |
| PUT | `/v2/persons/:personId/profile/skills/:skillEntryId` | edit |
| DELETE | `/v2/persons/:personId/profile/skills/:skillEntryId` | delete |

**Zmiana**: `src/index.ts` - dodać `import './persons/profileSkills/ProfileSkillRouters'`

### 2.4 Integracja z profilem
**Plik**: `src/persons/PersonsController.ts` - `getPersonProfileV2()`:
```typescript
const [profileExperiences, profileEducations, profileSkills] = await Promise.all([
    instance.repository.listPersonProfileExperiencesV2(personId),
    EducationController.find(personId),
    ProfileSkillController.find(personId),
]);
return { ...profile, profileExperiences, profileEducations, profileSkills };
```

### 2.5 Testy
- `src/persons/profileSkills/__tests__/ProfileSkillController.test.ts`
- `src/persons/skills/__tests__/SkillsDictionaryController.test.ts`

### Weryfikacja sesji 2
- `yarn test` - PASS
- `yarn build` - OK

---

## Sesja 3: Rozszerzone wyszukiwanie + skills na liście osób

**Scope**: Filtrowanie po skillach, skills w GROUP_CONCAT na liście, search po skillach.
**Zależność**: Wymaga Sesji 2 (tabele skills muszą być aktywne).

### 3.1 Rozszerzyć `PersonsSearchParams`
**Plik**: `src/persons/PersonRepository.ts` (linia 16)

Dodać:
```typescript
skillIds?: number[];    // filtruj: osoba ma DOWOLNY z tych skilli
hasProfile?: boolean;   // filtruj: osoba z profilem
```

### 3.2 Rozszerzyć `makeAndConditions()`
**Plik**: `src/persons/PersonRepository.ts`

Dla `skillIds` (EXISTS subquery - nie wymaga zmiany JOIN):
```sql
EXISTS (SELECT 1 FROM PersonProfileSkills pps
        JOIN PersonProfiles pp ON pp.Id = pps.PersonProfileId
        WHERE pp.PersonId = Persons.Id AND pps.SkillId IN (...))
```

Dla `hasProfile`:
```sql
EXISTS (SELECT 1 FROM PersonProfiles pp WHERE pp.PersonId = Persons.Id)
```

### 3.3 Skills na liście osób (GROUP_CONCAT)
**Plik**: `src/persons/PersonRepository.ts` - `findV2()` i `findLegacy()`

Dodać subquery do SELECT:
```sql
(SELECT GROUP_CONCAT(DISTINCT sd.Name ORDER BY sd.Name SEPARATOR ', ')
 FROM PersonProfileSkills pps
 JOIN PersonProfiles pp ON pp.Id = pps.PersonProfileId
 JOIN SkillsDictionary sd ON sd.Id = pps.SkillId
 WHERE pp.PersonId = Persons.Id) AS SkillNames
```

**Plik**: `src/persons/Person.ts` - dodać pole `_skillNames?: string`
**Plik**: `src/persons/PersonRepository.ts` - `mapRowToModel()` - dodać `_skillNames: row.SkillNames`

### 3.4 Rozszerzyć searchText o wyszukiwanie po skillach
**Plik**: `src/persons/PersonRepository.ts` - `makeSearchTextCondition()`

Dodać do warunków OR:
```sql
OR EXISTS (SELECT 1 FROM PersonProfileSkills pps
           JOIN PersonProfiles pp ON pp.Id = pps.PersonProfileId
           JOIN SkillsDictionary sd ON sd.Id = pps.SkillId
           WHERE pp.PersonId = Persons.Id AND sd.Name LIKE '%word%')
```

### 3.5 Testy
**Nowy plik**: `src/persons/__tests__/PersonRepository.search.test.ts`

### Weryfikacja sesji 3
- `yarn test` - PASS
- `yarn build` - OK
- Manual test: `POST /persons` z `skillIds` w orConditions → filtruje poprawnie
- Manual test: `POST /persons` → response zawiera `_skillNames`

---

## Podsumowanie plików

### Modyfikowane (backend)
| Plik | Sesja |
|------|-------|
| `src/types/types.d.ts` | 1, 2 |
| `src/persons/PersonsController.ts` | 1, 2 (zmiana w getPersonProfileV2) |
| `src/persons/PersonRepository.ts` | 3 (search, GROUP_CONCAT) |
| `src/persons/Person.ts` | 3 (_skillNames) |
| `src/index.ts` | 1, 2 (import routerów) |

### Nowe pliki (backend)
| Plik | Sesja |
|------|-------|
| **Sesja 1 - Education** | |
| `src/persons/educations/PersonProfileEducation.ts` | 1 |
| `src/persons/educations/EducationRepository.ts` | 1 |
| `src/persons/educations/EducationController.ts` | 1 |
| `src/persons/educations/EducationRouters.ts` | 1 |
| `src/persons/educations/__tests__/EducationController.test.ts` | 1 |
| **Sesja 2 - Skills Dictionary** | |
| `src/persons/skills/SkillsDictionaryRepository.ts` | 2 |
| `src/persons/skills/SkillsDictionaryController.ts` | 2 |
| `src/persons/skills/SkillsDictionaryRouters.ts` | 2 |
| `src/persons/skills/__tests__/SkillsDictionaryController.test.ts` | 2 |
| **Sesja 2 - Profile Skills** | |
| `src/persons/profileSkills/PersonProfileSkill.ts` | 2 |
| `src/persons/profileSkills/ProfileSkillRepository.ts` | 2 |
| `src/persons/profileSkills/ProfileSkillController.ts` | 2 |
| `src/persons/profileSkills/ProfileSkillRouters.ts` | 2 |
| `src/persons/profileSkills/__tests__/ProfileSkillController.test.ts` | 2 |
| **Sesja 3 - Search** | |
| `src/persons/__tests__/PersonRepository.search.test.ts` | 3 |

---

## Plan frontendu (ENVI.ProjectSite) - do realizacji PO backendzie

Osobna sesja/sesje w drugim repo. Zakres:
1. **Lista osób** - nowe kolumny: Skills (`_skillNames`), rola systemowa (warunkowo dla ENVI_EMPLOYEE+)
2. **Filtr po specjalizacjach** - multiselect dropdown pobierający z `GET /v2/skills`, wysyłający `skillIds` w searchParams
3. **Panel boczny** - klik na osobę otwiera panel z profilem (headline, summary), doświadczeniem, wykształceniem, skilami. Dane z `GET /v2/persons/:personId/profile`. Tylko odczyt.
4. **Repository kliencki** - nowe API calls do endpointów v2
