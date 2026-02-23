---
name: persons-v2-migration
description: >
  Etapowa migracja modelu Persons -> Persons + PersonAccounts + PersonProfiles (+ Experiences/Edu/Skills)
  bez Ĺ‚amania API, z feature flagami (dual-read/dual-write), backfill, rollback i wymaganymi aktualizacjami docs/env.
  UĹĽywaj przy PR-ach dotykajÄ…cych: migracji DB, PersonsController/PersonRepository, lub flag PERSONS_MODEL_V2_*.
---

# persons-v2-migration - workflow (minimalny, etapowy, kompatybilny)

## Zasady nadrzÄ™dne (stosuj)
- Clean Architecture MUST: Router -> (Validator) -> Controller -> Repository -> Model.
- Transakcje tylko w Controller (`ToolsDb.transaction`), nie w Repository.
- Model bez DB I/O.
- Zmiany env/DB/deploy: zaktualizuj `.env.example` i `documentation/team/operations/post-change-checklist.md`.
- KaĹĽdy nowy entry point/skrypt wywoĹ‚uje `loadEnv()`.
- Po refaktorze warstw lub mapowania DB->Model uruchom skill `refactoring-audit`.
- W PR domknij checklistÄ™ w `.github/PULL_REQUEST_TEMPLATE.md`.
- Po kaĹĽdej sesji i po kaĹĽdym zamkniÄ™tym checkpointcie etapu LLM MUSI automatycznie zaktualizowaÄ‡:
  - `documentation/team/operations/persons-v2-refactor/progress.md`
  - `Current Status Snapshot` (jeĹ›li etap/checkpoint zostaĹ‚ domkniÄ™ty)

## Cel
RozdzieliÄ‡ obecnÄ… odpowiedzialnoĹ›Ä‡ `Persons` na:
- `Persons` = toĹĽsamoĹ›Ä‡/kontakt (anchor pod FK),
- `PersonAccounts` = konto systemowe (opcjonalne 1:1 do osoby),
- `PersonProfiles` = profil (opcjonalny 1:1 do osoby),
- `PersonProfileExperiences` = migracja z `AchievementsExternal`,
- szkielety: `PersonProfileEducations`, `PersonProfileSkills` + `SkillsDictionary` (schema-only na start).

## Feature flags (wymagane)
- `PERSONS_MODEL_V2_READ_ENABLED` (default: `false`)
- `PERSONS_MODEL_V2_WRITE_DUAL` (default: `false`, uĹĽywane od Etapu 2)

## Etap 0 - guardrails (przed kodem)
1. Dodaj flagi do konfiguracji i `.env.example`.
2. Dopisz wpis do `documentation/team/operations/post-change-checklist.md` (DB/env/deploy).
3. Ustal metryki kontrolne:
- liczba osĂłb z kontem,
- liczba profili,
- zgodnoĹ›Ä‡ odczytu legacy vs v2.

## Etap 1 - schema + backfill + read facade (bez zmiany API)
### 1.1 DB schema
- Dodaj tabele: `PersonAccounts`, `PersonProfiles`, `PersonProfileExperiences`.
- Dodaj szkielety (schema-only): `PersonProfileEducations`, `PersonProfileSkills`, `SkillsDictionary`.
- Ograniczenia:
- `PersonId UNIQUE` w `PersonAccounts` i `PersonProfiles` (1:1),
- FK do `Persons`,
- indeksy na kolumnach filtrujÄ…cych i joinowanych.

### 1.2 Backfill (idempotentny)
- `PersonAccounts`: twĂłrz rekord tylko gdy jest `SystemEmail` lub zewnÄ™trzne ID/token.
- `PersonProfiles`: twĂłrz rekord dla osĂłb bÄ™dÄ…cych pracownikiem/wspĂłĹ‚pracownikiem albo wĹ‚aĹ›cicielami rekordĂłw w `AchievementsExternal`.
- `PersonProfileExperiences`: migracja 1:1 z `AchievementsExternal`.
- WymĂłg idempotencji: `UPSERT` / `INSERT IGNORE` + deterministyczne mapowanie.

### 1.3 Read model (facade)
- Dodaj `PersonsReadFacade`:
- zwraca legacy DTO/Model dla starego kodu,
- ĹşrĂłdĹ‚o danych przeĹ‚Ä…czane flagÄ… `PERSONS_MODEL_V2_READ_ENABLED`,
- przy ON: czytaj z nowych tabel; gdy brak konta/profilu stosuj fallback legacy (Etap 1).
- Przepnij tylko publiczne odczyty (np. `PersonsController.find`, `getSystemRole`, `getPersonBySystemEmail`) na facade.

### 1.4 Evidence i akceptacja Etapu 1 (DoD)
- Flaga OFF: zachowanie identyczne jak przed zmianÄ….
- Flaga ON: te same pola legacy sÄ… dostÄ™pne w odpowiedziach, zwĹ‚aszcza `systemRoleId/systemEmail`.
- Wykonaj porĂłwnanie `legacy vs v2 read` i zapisz evidence:
- `find` (co najmniej 3 reprezentatywne zestawy warunkĂłw),
- `getSystemRole` (dla konta istniejÄ…cego i braku konta),
- `getPersonBySystemEmail`.
- Brak transakcji w Repository.
- `.env.example` i `documentation/team/operations/post-change-checklist.md` zaktualizowane.
- Checklista PR (`.github/PULL_REQUEST_TEMPLATE.md`) uzupeĹ‚niona.

### 1.5 Rollback
- WyĹ‚Ä…cz `PERSONS_MODEL_V2_READ_ENABLED` i wrĂłÄ‡ do odczytu legacy bez regresji.

## Etap 2 - dual-write (dopiero gdy read v2 stabilny)
1. WĹ‚Ä…cz dual-write za flagÄ… `PERSONS_MODEL_V2_WRITE_DUAL`:
- kontakt -> `Persons`,
- konto -> `PersonAccounts`,
- profil/doĹ›wiadczenia -> `PersonProfiles` / `PersonProfileExperiences`,
- legacy endpointy pozostajÄ… aktywne.
2. Dodaj ochronÄ™ antyduplikacyjnÄ… (UNIQUE + obsĹ‚uga konfliktĂłw) i testy idempotencji.
3. Po zmianach uruchom `refactoring-audit`.

## Etap 3+ (przypomnienie)
- Nowe endpointy v2 (account/profile/experiences), migracja UI moduĹ‚ami.
- Deprecacja legacy pĂłl w `Persons` dopiero po stabilizacji i telemetryce.

## Output oczekiwany po uĹĽyciu skilla
- Lista plikĂłw/tabel do zmiany w PR.
- Plan etapowy (Etap 0/1/2) z checklistÄ… DoD.
- Notatka operacyjna: co dopisaÄ‡ do `.env.example` i `post-change-checklist.md`.
- Instrukcja rollback + minimalne testy weryfikacyjne.
- Evidence: wyniki porĂłwnaĹ„ `legacy vs v2 read` dla metod wymaganych w Etapie 1.
- Wpis w progress file z:
  - sekcjÄ… evidence,
  - sekcjÄ… next session actions,
  - statusem checkpointu (`OPEN`/`CLOSED`).

