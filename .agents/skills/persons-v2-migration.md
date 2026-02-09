---
name: persons-v2-migration
description: >
  Etapowa migracja modelu Persons -> Persons + PersonAccounts + PersonProfiles (+ Experiences/Edu/Skills)
  bez łamania API, z feature flagami (dual-read/dual-write), backfill, rollback i wymaganymi aktualizacjami docs/env.
  Używaj przy PR-ach dotykających: migracji DB, PersonsController/PersonRepository, lub flag PERSONS_MODEL_V2_*.
---

# persons-v2-migration - workflow (minimalny, etapowy, kompatybilny)

## Zasady nadrzędne (stosuj)
- Clean Architecture MUST: Router -> (Validator) -> Controller -> Repository -> Model.
- Transakcje tylko w Controller (`ToolsDb.transaction`), nie w Repository.
- Model bez DB I/O.
- Zmiany env/DB/deploy: zaktualizuj `.env.example` i `docs/team/operations/post-change-checklist.md`.
- Każdy nowy entry point/skrypt wywołuje `loadEnv()`.
- Po refaktorze warstw lub mapowania DB->Model uruchom skill `refactoring-audit`.
- W PR domknij checklistę w `.github/PULL_REQUEST_TEMPLATE.md`.
- Po każdej sesji i po każdym zamkniętym checkpointcie etapu LLM MUSI automatycznie zaktualizować:
  - `docs/team/operations/persons-v2-refactor-progress.md`
  - `Current Status Snapshot` (jeśli etap/checkpoint został domknięty)

## Cel
Rozdzielić obecną odpowiedzialność `Persons` na:
- `Persons` = tożsamość/kontakt (anchor pod FK),
- `PersonAccounts` = konto systemowe (opcjonalne 1:1 do osoby),
- `PersonProfiles` = profil (opcjonalny 1:1 do osoby),
- `PersonProfileExperiences` = migracja z `AchievementsExternal`,
- szkielety: `PersonProfileEducations`, `PersonProfileSkills` + `SkillsDictionary` (schema-only na start).

## Feature flags (wymagane)
- `PERSONS_MODEL_V2_READ_ENABLED` (default: `false`)
- `PERSONS_MODEL_V2_WRITE_DUAL` (default: `false`, używane od Etapu 2)

## Etap 0 - guardrails (przed kodem)
1. Dodaj flagi do konfiguracji i `.env.example`.
2. Dopisz wpis do `docs/team/operations/post-change-checklist.md` (DB/env/deploy).
3. Ustal metryki kontrolne:
- liczba osób z kontem,
- liczba profili,
- zgodność odczytu legacy vs v2.

## Etap 1 - schema + backfill + read facade (bez zmiany API)
### 1.1 DB schema
- Dodaj tabele: `PersonAccounts`, `PersonProfiles`, `PersonProfileExperiences`.
- Dodaj szkielety (schema-only): `PersonProfileEducations`, `PersonProfileSkills`, `SkillsDictionary`.
- Ograniczenia:
- `PersonId UNIQUE` w `PersonAccounts` i `PersonProfiles` (1:1),
- FK do `Persons`,
- indeksy na kolumnach filtrujących i joinowanych.

### 1.2 Backfill (idempotentny)
- `PersonAccounts`: twórz rekord tylko gdy jest `SystemEmail` lub zewnętrzne ID/token.
- `PersonProfiles`: twórz rekord dla osób będących pracownikiem/współpracownikiem albo właścicielami rekordów w `AchievementsExternal`.
- `PersonProfileExperiences`: migracja 1:1 z `AchievementsExternal`.
- Wymóg idempotencji: `UPSERT` / `INSERT IGNORE` + deterministyczne mapowanie.

### 1.3 Read model (facade)
- Dodaj `PersonsReadFacade`:
- zwraca legacy DTO/Model dla starego kodu,
- źródło danych przełączane flagą `PERSONS_MODEL_V2_READ_ENABLED`,
- przy ON: czytaj z nowych tabel; gdy brak konta/profilu stosuj fallback legacy (Etap 1).
- Przepnij tylko publiczne odczyty (np. `PersonsController.find`, `getSystemRole`, `getPersonBySystemEmail`) na facade.

### 1.4 Evidence i akceptacja Etapu 1 (DoD)
- Flaga OFF: zachowanie identyczne jak przed zmianą.
- Flaga ON: te same pola legacy są dostępne w odpowiedziach, zwłaszcza `systemRoleId/systemEmail`.
- Wykonaj porównanie `legacy vs v2 read` i zapisz evidence:
- `find` (co najmniej 3 reprezentatywne zestawy warunków),
- `getSystemRole` (dla konta istniejącego i braku konta),
- `getPersonBySystemEmail`.
- Brak transakcji w Repository.
- `.env.example` i `docs/team/operations/post-change-checklist.md` zaktualizowane.
- Checklista PR (`.github/PULL_REQUEST_TEMPLATE.md`) uzupełniona.

### 1.5 Rollback
- Wyłącz `PERSONS_MODEL_V2_READ_ENABLED` i wróć do odczytu legacy bez regresji.

## Etap 2 - dual-write (dopiero gdy read v2 stabilny)
1. Włącz dual-write za flagą `PERSONS_MODEL_V2_WRITE_DUAL`:
- kontakt -> `Persons`,
- konto -> `PersonAccounts`,
- profil/doświadczenia -> `PersonProfiles` / `PersonProfileExperiences`,
- legacy endpointy pozostają aktywne.
2. Dodaj ochronę antyduplikacyjną (UNIQUE + obsługa konfliktów) i testy idempotencji.
3. Po zmianach uruchom `refactoring-audit`.

## Etap 3+ (przypomnienie)
- Nowe endpointy v2 (account/profile/experiences), migracja UI modułami.
- Deprecacja legacy pól w `Persons` dopiero po stabilizacji i telemetryce.

## Output oczekiwany po użyciu skilla
- Lista plików/tabel do zmiany w PR.
- Plan etapowy (Etap 0/1/2) z checklistą DoD.
- Notatka operacyjna: co dopisać do `.env.example` i `post-change-checklist.md`.
- Instrukcja rollback + minimalne testy weryfikacyjne.
- Evidence: wyniki porównań `legacy vs v2 read` dla metod wymaganych w Etapie 1.
- Wpis w progress file z:
  - sekcją evidence,
  - sekcją next session actions,
  - statusem checkpointu (`OPEN`/`CLOSED`).
