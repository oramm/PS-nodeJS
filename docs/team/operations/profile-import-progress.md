# Profile Import Progress

## How to Use

1. Append one entry after each implementation session.
2. Keep entries factual and evidence-based.
3. Never rewrite old entries except to fix factual mistakes.
4. Next session must start by reading this file.
5. LLM MUST auto-update this file at end of session (mandatory).

---

## Current Status

- Overall status: SESSION_1_CLOSED
- Ostatnia zakończona sesja: 1
- Następna sesja: N/A (feature complete)

---

## Feature Overview

Dwuetapowy import profilu osoby z pliku CV (PDF/DOCX) przez OpenAI.

### Przepływ

```
Etap 1: POST /v2/persons/:personId/profile/analyze-file
        ↓ wyciąga tekst (ToolsAI.extractTextFromFile)
        ↓ 1 call OpenAI → ustrukturyzowany JSON
        ↓ zwraca podgląd { experiences, educations, skills, _extractedText }
        (BRAK zapisu do DB)

Etap 2: Klient wyświetla podgląd, użytkownik koryguje
        ↓ klient wywołuje 3 endpointy (równolegle lub osobno):
        POST /v2/persons/:personId/profile/experiences/import-confirm
        POST /v2/persons/:personId/profile/educations/import-confirm
        POST /v2/persons/:personId/profile/skills/import-confirm
        ↓ każdy endpoint sprawdza duplikaty i zapisuje do DB
```

---

## API Reference

### Etap 1 — Analiza pliku

```
POST /v2/persons/:personId/profile/analyze-file
Content-Type: multipart/form-data
Pole: file (PDF lub DOCX)
```

**Response 200:**
```json
{
  "experiences": [
    {
      "organizationName": "Firma X Sp. z o.o.",
      "positionName": "Senior Developer",
      "description": "Rozwój aplikacji webowych...",
      "dateFrom": "2020-03-01",
      "dateTo": "2023-11-01",
      "isCurrent": false
    }
  ],
  "educations": [
    {
      "schoolName": "AGH Akademia Górniczo-Hutnicza",
      "degreeName": "magister",
      "fieldOfStudy": "Informatyka",
      "dateFrom": "2015-10-01",
      "dateTo": "2020-07-01"
    }
  ],
  "skills": [
    {
      "skillName": "TypeScript",
      "levelCode": "advanced",
      "yearsOfExperience": 3.5
    }
  ],
  "_extractedText": "Jan Kowalski\nSenior Developer..."
}
```

**Uwagi:**
- Daty normalizowane do `YYYY-MM-01` (pierwszy dzień miesiąca)
- Pola mogą być `undefined` jeśli AI nie znalazło danych
- `_extractedText` = surowy tekst wyciągnięty z pliku (do debugowania)
- Brak zapisu do DB — wynik służy tylko jako podgląd dla użytkownika

---

### Etap 2a — Potwierdzenie doświadczeń

```
POST /v2/persons/:personId/profile/experiences/import-confirm
Content-Type: application/json
Body: { "items": [ <PersonProfileExperienceV2Payload>, ... ] }
```

**Duplikat:** `dateFrom == existing.dateFrom AND dateTo == existing.dateTo` (NULL-safe `<=>`)

**Response 200:**
```json
{
  "added": [ <PersonProfileExperienceV2Record>, ... ],
  "skipped": [ <PersonProfileExperienceV2Payload>, ... ]
}
```

---

### Etap 2b — Potwierdzenie wykształcenia

```
POST /v2/persons/:personId/profile/educations/import-confirm
Content-Type: application/json
Body: { "items": [ <PersonProfileEducationV2Payload>, ... ] }
```

**Duplikat:** `LOWER(schoolName) == LOWER(existing.schoolName) AND dateFrom == existing.dateFrom`

**Response 200:**
```json
{
  "added": [ <PersonProfileEducationV2Record>, ... ],
  "skipped": [ <PersonProfileEducationV2Payload>, ... ]
}
```

---

### Etap 2c — Potwierdzenie umiejętności

```
POST /v2/persons/:personId/profile/skills/import-confirm
Content-Type: application/json
Body: {
  "items": [
    { "skillName": "TypeScript", "levelCode": "advanced", "yearsOfExperience": 3.5 },
    ...
  ]
}
```

**Logika:**
1. Szuka `skillName` w `SkillsDictionary` po `NameNormalized` (case-insensitive, trim)
2. Jeśli skill nie istnieje w słowniku → tworzy nowy wpis
3. Jeśli skill już przypisany do profilu osoby → skip
4. Duplikaty w obrębie jednego importu obsługiwane przez lokalny cache

**Duplikat:** `skillId` już przypisany do profilu osoby

**Response 200:**
```json
{
  "added": [ <PersonProfileSkillV2Record>, ... ],
  "skipped": [ { "skillName": "...", ... }, ... ],
  "newDictionaryEntries": [ <SkillDictionaryRecord>, ... ]
}
```

**Uwaga:** `newDictionaryEntries` zawiera wpisy dodane automatycznie do `SkillsDictionary` podczas importu.

---

## Kluczowe pliki

| Plik | Rola |
|------|------|
| `src/tools/ToolsAI.ts` | `analyzePersonProfile(file)` + typy `AiExperience`, `AiEducation`, `AiSkill`, `AiPersonProfileResult` |
| `src/persons/profileImport/PersonProfileImportRouters.ts` | Router dla `/analyze-file` (multer + ToolsAI, brak kontrolera) |
| `src/persons/experiences/ExperienceRepository.ts` | `findByPeriod(personId, dateFrom, dateTo, conn)` |
| `src/persons/experiences/ExperienceController.ts` | `importFromDto(personId, items[])` |
| `src/persons/experiences/ExperienceRouters.ts` | `/experiences/import-confirm` |
| `src/persons/educations/EducationRepository.ts` | `findBySchoolAndDate(personId, schoolName, dateFrom, conn)` |
| `src/persons/educations/EducationController.ts` | `importFromDto(personId, items[])` |
| `src/persons/educations/EducationRouters.ts` | `/educations/import-confirm` |
| `src/persons/skills/SkillsDictionaryRepository.ts` | `findByNormalizedName(name)` |
| `src/persons/profileSkills/ProfileSkillController.ts` | `importFromDto(personId, items[])` |
| `src/persons/profileSkills/ProfileSkillRouters.ts` | `/skills/import-confirm` |

---

## Decyzje architektoniczne

### Dlaczego `analyze-file` nie ma własnego kontrolera?

Router `PersonProfileImportRouters.ts` wywołuje `ToolsAI.analyzePersonProfile()` bezpośrednio — bez pośredniego kontrolera. Jest to celowe uproszczenie wynikające z braku logiki biznesowej DB w tym endpoincie: sama analiza nie dotyka bazy danych. `ToolsAI` pełni rolę narzędziową (jak `ToolsDb`, `ToolsGd`).

### NULL-safe `<=>` w duplikatach

MySQL operator `<=>` (NULL-safe equality) pozwala na porównanie `DateTo IS NULL` bez osobnego warunku. Zamiast:
```sql
AND (DateTo = ? OR (DateTo IS NULL AND ? IS NULL))
```
używamy:
```sql
AND DateTo <=> ?
```

### Cache słownika umiejętności w importFromDto

`ProfileSkillController.importFromDto` buduje lokalny `Map<normalizedName, SkillDictionaryRecord>` na czas transakcji. Zapobiega to próbie podwójnego INSERT do `SkillsDictionary` gdy ten sam skill pojawia się wielokrotnie w jednym pliku CV — nowo dodane wpisy nie są jeszcze widoczne dla `findByNormalizedName()` (które korzysta z puli, nie z połączenia transakcyjnego).

---

## Konfiguracja środowiska

Wymagane zmienne środowiskowe:
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini    # opcjonalne, domyślnie gpt-4o-mini
```

---

## Rozszerzanie

### Dodanie nowego modułu importu (np. certyfikaty)

1. **Repository:** Dodaj `findByDuplicateKey(personId, ..., conn)` w nowym lub istniejącym repozytorium
2. **Controller:** Dodaj statyczną metodę `importFromDto(personId, items[])` z transakcją
3. **Router:** Dodaj `POST /v2/persons/:personId/profile/<modul>/import-confirm`
4. **ToolsAI:** Rozszerz `AiPersonProfileResult` o nowe pole i zaktualizuj prompt w `analyzePersonProfile()`
5. **index.ts:** Zarejestruj nowy router

---

## Session Log

### 2026-02-18 - Sesja 1 - Implementacja

#### Scope

- Analiza pliku CV (PDF/DOCX) przez OpenAI → ustrukturyzowany JSON
- Dwuetapowy przepływ: analyze-file + 3 osobne import-confirm
- Obsługa duplikatów dla experiences, educations, skills
- Auto-tworzenie wpisów w SkillsDictionary

#### Completed

- `src/tools/ToolsAI.ts` — dodano typy `AiExperience`, `AiEducation`, `AiSkill`, `AiPersonProfileResult` i metodę `analyzePersonProfile(file)` z normalizacją dat `YYYY-MM` → `YYYY-MM-01`
- `src/persons/profileImport/PersonProfileImportRouters.ts` — nowy router dla `POST /v2/persons/:personId/profile/analyze-file` (multer, brak kontrolera)
- `src/persons/experiences/ExperienceRepository.ts` — `findByPeriod()` (NULL-safe `<=>`)
- `src/persons/experiences/ExperienceController.ts` — `importFromDto()` z transakcją
- `src/persons/experiences/ExperienceRouters.ts` — endpoint `import-confirm`
- `src/persons/educations/EducationRepository.ts` — `findBySchoolAndDate()` (LOWER comparison)
- `src/persons/educations/EducationController.ts` — `importFromDto()` z transakcją
- `src/persons/educations/EducationRouters.ts` — endpoint `import-confirm`
- `src/persons/skills/SkillsDictionaryRepository.ts` — `findByNormalizedName()`
- `src/persons/profileSkills/ProfileSkillController.ts` — `importFromDto()` z transakcją, cache słownika
- `src/persons/profileSkills/ProfileSkillRouters.ts` — endpoint `import-confirm`
- `src/index.ts` — zarejestrowano `PersonProfileImportRouters`

#### Evidence

- `yarn build` → OK (0 errors)
- `yarn test` (all) → 17/20 suites passed. 3 failed suites are pre-existing (PersonsRouters.p3d, ContractsController, OffersController) — potwierdzone przez `git stash` + re-run przed moimi zmianami

#### Endpointy

| Metoda | Endpoint | Opis | Status |
|--------|----------|------|--------|
| POST | `/v2/persons/:personId/profile/analyze-file` | Analiza pliku CV (multipart) | ACTIVE |
| POST | `/v2/persons/:personId/profile/experiences/import-confirm` | Zapis doświadczeń | ACTIVE |
| POST | `/v2/persons/:personId/profile/educations/import-confirm` | Zapis wykształcenia | ACTIVE |
| POST | `/v2/persons/:personId/profile/skills/import-confirm` | Zapis umiejętności | ACTIVE |
