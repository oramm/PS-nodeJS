# Plan: ModuĹ‚ HR - Backend (PS-nodeJS)

## Context

Firma Ĺ›wiadczy usĹ‚ugi konsultingowe i nadzoru inwestorskiego - sprzedaje wiedzÄ™ i doĹ›wiadczenie swoich ludzi. Obecny moduĹ‚ persons to tylko ksiÄ…ĹĽka kontaktowa. Potrzebny jest moduĹ‚ HR pozwalajÄ…cy zarzÄ…dzaÄ‡ specjalizacjami, doĹ›wiadczeniem zawodowym i wyksztaĹ‚ceniem personelu.

Refactoring Persons V2 (P1-P4) przygotowaĹ‚ strukturÄ™ DB - tabele `PersonProfileEducations`, `SkillsDictionary`, `PersonProfileSkills` istniejÄ… jako szkielety (schema-only, bez kodu). Ten plan aktywuje je.

**Repo**: PS-nodeJS (ten plan)
**Frontend** (ENVI.ProjectSite): planowany osobno po zakoĹ„czeniu backendu
**Nazewnictwo**: zachowujemy "skills" w API/DB

---

## Zasady nadrzÄ™dne (stosuj w kaĹĽdej sesji)

1. **Clean Architecture MUST**: Router â†’ (Validator) â†’ Controller â†’ Repository â†’ Model
2. **Transakcje** tylko w Controller (`ToolsDb.transaction()`), nie w Repository
3. **Model** bez DB I/O
4. **Testowanie per warstwa**: Model = unit tests, Repository = integration (skipped), Controller = unit z mockami. WzĂłr: `src/offers/__tests__/`
5. **Mock pattern**: `jest.mock('../../BussinesObject')`, manual mocks w `__mocks__/`
6. Po refaktorze warstw CRUD/repository/model â†’ uruchom skill `refactoring-audit`
7. Zmiany env/DB/deploy â†’ zaktualizuj `.env.example` i `documentation/team/operations/post-change-checklist.md`
8. W PR domknij checklistÄ™ `.github/PULL_REQUEST_TEMPLATE.md`
9. Nowe entry points wywoĹ‚ujÄ… `loadEnv()`
10. Po kaĹĽdej sesji **OBOWIÄ„ZKOWO** zaktualizuj `documentation/team/operations/hr-module/progress.md`

**Pliki referencyjne architektoniczne** (`.github/instructions/`):
- `architektura.instructions.md` - reguĹ‚y Clean Architecture
- `architektura-testowanie.md` - wytyczne testowania per warstwa
- `architektura-refactoring-audit.md` - checklist audytu po refaktorze
- `architektura-ai-assistant.md` - decision trees dla AI

---

## Kontrakt sesji (obowiÄ…zkowy)

### Pliki referencyjne
- **Plan**: `documentation/team/operations/hr-module/plan.md` (kopia tego planu)
- **Progress**: `documentation/team/operations/hr-module/progress.md`

### Workflow nowej sesji
1. Przeczytaj plan: `documentation/team/operations/hr-module/plan.md`
2. Przeczytaj progress: `documentation/team/operations/hr-module/progress.md`
3. Wykonaj TYLKO swojÄ… sesjÄ™ (pierwszÄ… OPEN z listy)
4. Na koniec sesji zaktualizuj plik progress z wynikami

### Plik progress - struktura
```md
# HR Module Progress

## Current Status
- NastÄ™pna sesja: <1|2|3|DONE>
- Ostatnia zakoĹ„czona: <none|1|2|3>

## Session Log

### YYYY-MM-DD - Sesja N - <tytuĹ‚>
#### Scope
- Zaplanowane zadania: ...

#### Completed
- Co zrobiono: ...

#### Evidence
- `yarn test` â†’ PASS/FAIL
- `yarn build` â†’ OK/FAIL
- Zmienione pliki: ...

#### Next
- NastÄ™pna sesja: <N+1> lub DONE
- Blokery: <brak | opis>
```

---

## Sesja 1: Education CRUD (osobny moduĹ‚)

**Scope**: Aktywacja szkieletu `PersonProfileEducations` - osobny Model/Repository/Controller/Router.
**Wzorzec**: Analogiczny do `src/persons/projectRoles/` (osobny sub-moduĹ‚ w persons).
**Lokalizacja**: `src/persons/educations/`

### 1.1 Typy TypeScript
**Plik**: `src/types/types.d.ts` - dodaÄ‡:
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
- `mapRowToModel(row)` â†’ `PersonProfileEducation`
- `find(personId)` â†’ SELECT z JOIN PersonProfiles, ORDER BY SortOrder, Id
- `addInDb(personId, education, conn)` â†’ INSERT. Potrzebuje helper `ensurePersonProfileId()` - wyekstrahowaÄ‡ ze wspĂłĹ‚dzielonego helpera lub zduplikowaÄ‡ (prywatna metoda)
- `editInDb(personId, educationId, education, conn)` â†’ UPDATE
- `deleteFromDb(personId, educationId, conn)` â†’ DELETE z JOIN
- `private getByIdInConn(conn, personId, educationId)` â†’ helper

Kolumny DB (z `001_create_persons_v2_schema.sql` linia 65): SchoolName, DegreeName, FieldOfStudy, DateFrom, DateTo, SortOrder.

**Uwaga**: `ensurePersonProfileId(personId, conn)` jest prywatnÄ… metodÄ… PersonRepository (linia 923). Opcje:
- a) WyekstrahowaÄ‡ do wspĂłĹ‚dzielonego helpera (np. `src/persons/PersonProfileHelper.ts`)
- b) ZduplikowaÄ‡ w EducationRepository (prostsze, maĹ‚y helper)

### 1.4 Controller
**Nowy plik**: `src/persons/educations/EducationController.ts`
- Singleton (wzĂłr BaseController)
- `find(personId)` â†’ delegates to repository
- `addFromDto(personId, data)` â†’ `ToolsDb.transaction()`, ensure profile exists
- `editFromDto(personId, educationId, data)` â†’ `ToolsDb.transaction()`
- `deleteFromDto(personId, educationId)` â†’ `ToolsDb.transaction()`, returns `{ id }`

### 1.5 Router
**Nowy plik**: `src/persons/educations/EducationRouters.ts`

| Metoda | Endpoint | Handler |
|--------|----------|---------|
| GET | `/v2/persons/:personId/profile/educations` | list |
| POST | `/v2/persons/:personId/profile/educations` | add |
| PUT | `/v2/persons/:personId/profile/educations/:educationId` | edit |
| DELETE | `/v2/persons/:personId/profile/educations/:educationId` | delete |

Payload: `schoolName`, `degreeName`, `fieldOfStudy`, `dateFrom`, `dateTo`, `sortOrder`.

**Zmiana**: `src/index.ts` - dodaÄ‡ `import './persons/educations/EducationRouters'`

### 1.6 Integracja z profilem
**Plik**: `src/persons/PersonsController.ts` - `getPersonProfileV2()` (linia 335)

DodaÄ‡ `profileEducations` (import EducationController):
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
- `yarn test` - nowe testy PASS + istniejÄ…ce niezĹ‚amane
- `yarn build` - kompilacja OK

---

## Sesja 2: Skills Dictionary + PersonProfileSkills CRUD

**Scope**: Aktywacja `SkillsDictionary` + `PersonProfileSkills`.
**ZaleĹĽnoĹ›Ä‡**: Brak zaleĹĽnoĹ›ci od Sesji 1 (ale logicznie po niej).

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

### 2.2 SkillsDictionary - osobny mini-moduĹ‚
**Nowe pliki**:

**`src/persons/skills/SkillsDictionaryRepository.ts`**
- Extends `BaseRepository`
- `find(searchParams?)` - lista, opcjonalny `searchText` (LIKE na Name)
- `mapRowToModel(row)` â†’ `SkillDictionaryRecord`
- Helper `normalizeName(name)` - lowercase, trim, collapse whitespace â†’ `NameNormalized`
- Na INSERT/UPDATE: walidacja unikalnoĹ›ci (UNIQUE na Name i NameNormalized - DB wyrzuci bĹ‚Ä…d)

**`src/persons/skills/SkillsDictionaryController.ts`**
- Singleton (wzĂłr BaseController)
- `find(searchParams?)`, `addFromDto(payload)`, `editFromDto(id, payload)`, `delete(id)`
- DELETE: FK RESTRICT na PersonProfileSkills â†’ bĹ‚Ä…d jeĹ›li skill w uĹĽyciu (poprawne zachowanie)

**`src/persons/skills/SkillsDictionaryRouters.ts`**

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/v2/skills` | Lista (do dropdownĂłw). Query param `?searchText=` |
| POST | `/v2/skills` | Dodaj |
| PUT | `/v2/skills/:skillId` | Edytuj nazwÄ™ |
| DELETE | `/v2/skills/:skillId` | UsuĹ„ (fails if in use) |

**Zmiana**: `src/index.ts` - dodaÄ‡ `import './persons/skills/SkillsDictionaryRouters'`

### 2.3 PersonProfileSkills - osobny sub-moduĹ‚
**Lokalizacja**: `src/persons/profileSkills/`

**Nowy plik**: `src/persons/profileSkills/PersonProfileSkill.ts`
- Extends BusinessObject
- Pola: id, personProfileId, skillId, levelCode, yearsOfExperience, sortOrder, `_skill?: SkillDictionaryRecord`

**Nowy plik**: `src/persons/profileSkills/ProfileSkillRepository.ts`
- Extends BaseRepository, tableName = `PersonProfileSkills`
- `mapRowToModel(row)` â†’ `PersonProfileSkill` (z JOIN: SkillName, SkillNameNormalized)
- `find(personId)` â†’ SELECT z JOIN SkillsDictionary, PersonProfiles
- `addInDb(personId, skill, conn)` â†’ INSERT, `ensurePersonProfileId()`, obsĹ‚uga UNIQUE(PersonProfileId, SkillId)
- `editInDb(personId, skillEntryId, skill, conn)` â†’ UPDATE (levelCode, yearsOfExperience, sortOrder - NIE skillId)
- `deleteFromDb(personId, skillEntryId, conn)` â†’ DELETE

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

**Zmiana**: `src/index.ts` - dodaÄ‡ `import './persons/profileSkills/ProfileSkillRouters'`

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

## Sesja 3: Rozszerzone wyszukiwanie + skills na liĹ›cie osĂłb

**Scope**: Filtrowanie po skillach, skills w GROUP_CONCAT na liĹ›cie, search po skillach.
**ZaleĹĽnoĹ›Ä‡**: Wymaga Sesji 2 (tabele skills muszÄ… byÄ‡ aktywne).

### 3.1 RozszerzyÄ‡ `PersonsSearchParams`
**Plik**: `src/persons/PersonRepository.ts` (linia 16)

DodaÄ‡:
```typescript
skillIds?: number[];    // filtruj: osoba ma DOWOLNY z tych skilli
hasProfile?: boolean;   // filtruj: osoba z profilem
```

### 3.2 RozszerzyÄ‡ `makeAndConditions()`
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

### 3.3 Skills na liĹ›cie osĂłb (GROUP_CONCAT)
**Plik**: `src/persons/PersonRepository.ts` - `findV2()` i `findLegacy()`

DodaÄ‡ subquery do SELECT:
```sql
(SELECT GROUP_CONCAT(DISTINCT sd.Name ORDER BY sd.Name SEPARATOR ', ')
 FROM PersonProfileSkills pps
 JOIN PersonProfiles pp ON pp.Id = pps.PersonProfileId
 JOIN SkillsDictionary sd ON sd.Id = pps.SkillId
 WHERE pp.PersonId = Persons.Id) AS SkillNames
```

**Plik**: `src/persons/Person.ts` - dodaÄ‡ pole `_skillNames?: string`
**Plik**: `src/persons/PersonRepository.ts` - `mapRowToModel()` - dodaÄ‡ `_skillNames: row.SkillNames`

### 3.4 RozszerzyÄ‡ searchText o wyszukiwanie po skillach
**Plik**: `src/persons/PersonRepository.ts` - `makeSearchTextCondition()`

DodaÄ‡ do warunkĂłw OR:
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
- Manual test: `POST /persons` z `skillIds` w orConditions â†’ filtruje poprawnie
- Manual test: `POST /persons` â†’ response zawiera `_skillNames`

---

## Podsumowanie plikĂłw

### Modyfikowane (backend)
| Plik | Sesja |
|------|-------|
| `src/types/types.d.ts` | 1, 2 |
| `src/persons/PersonsController.ts` | 1, 2 (zmiana w getPersonProfileV2) |
| `src/persons/PersonRepository.ts` | 3 (search, GROUP_CONCAT) |
| `src/persons/Person.ts` | 3 (_skillNames) |
| `src/index.ts` | 1, 2 (import routerĂłw) |

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
1. **Lista osĂłb** - nowe kolumny: Skills (`_skillNames`), rola systemowa (warunkowo dla ENVI_EMPLOYEE+)
2. **Filtr po specjalizacjach** - multiselect dropdown pobierajÄ…cy z `GET /v2/skills`, wysyĹ‚ajÄ…cy `skillIds` w searchParams
3. **Panel boczny** - klik na osobÄ™ otwiera panel z profilem (headline, summary), doĹ›wiadczeniem, wyksztaĹ‚ceniem, skilami. Dane z `GET /v2/persons/:personId/profile`. Tylko odczyt.
4. **Repository kliencki** - nowe API calls do endpointĂłw v2

