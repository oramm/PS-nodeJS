---
name: db-schema-snapshot-mariadb
description: >
  Snapshot schematu MariaDB przed zmianami: information_schema (tabele/kolumny/FK/indeksy)
  + raport ryzyk (FK, brak indeksów pod JOIN, zmiany nullability/unique).
  Używaj przed PR dotykającym migracji DB w obszarze Persons i powiązanych tabel.
---

# db-schema-snapshot-mariadb - standaryzowany snapshot + ryzyka

## Cel
Zebrać porównywalny "stan przed" i wskazać ryzyka (FK/indeksy/unique/nullability) przed migracją.

## Wejście
- Środowisko (`development`/`production`) i aktywny DB target.
- Nazwy tabel objętych zmianą.
- Minimalny zakres dla refaktoru Persons:
- `Persons`,
- `PersonAccounts`,
- `PersonProfiles`,
- `PersonProfileExperiences`,
- `PersonProfileEducations`,
- `PersonProfileSkills`,
- `SkillsDictionary`.

## Obowiązkowe tabele zależne do sprawdzenia (FK do Persons)
Co najmniej te obszary:
- `Roles`, `Tasks`, `Tasks_Watchers`,
- `Invoices`, `InvoiceItems`,
- `Letters`, `LetterEvents`,
- `Offers`, `OfferEvents`, `OfferInvitationMails`,
- `MeetingArrangements`, `MaterialCards`, `MaterialCardVersions`,
- `OurContractsData`, `Securities`,
- `Processes`, `ProcessesStepsInstances`, `ProcessInstances`,
- `Persons_Contracts`,
- `AchievementsExternal` (źródło migracji doświadczenia).

## Kroki snapshotu
1. Potwierdź środowisko i DB target (`loadEnv()` + log host/db).
2. Zbierz metadane `information_schema`:
- `COLUMNS`: typy, nullability, default, key.
- `KEY_COLUMN_USAGE` + `REFERENTIAL_CONSTRAINTS`: FK i reguły delete/update.
- `STATISTICS`: indeksy i unikalność.
3. Zbierz wielkość tabel i wolumen rekordów (`COUNT(*)`) dla tabel krytycznych.
4. Zapisz snapshot w pliku `tmp/db-snapshots/<timestamp>-persons-v2.md`.

## Heurystyki ryzyk (raport)
- FK bez indeksu po stronie child -> CRITICAL/WARNING wydajności.
- Kolumna używana w JOIN/WHERE bez indeksu -> WARNING.
- Zmiana nullability / unique -> CRITICAL zgodności runtime/backfill.
- Duża tabela + brak idempotentnego backfill -> CRITICAL deployment.
- Zmiana reguł `ON DELETE`/`ON UPDATE` bez uzasadnienia -> CRITICAL.

## Output
- Snapshot metadanych (tabele, kolumny, FK, indeksy, wolumeny, środowisko, timestamp).
- Lista ryzyk: `CRITICAL` / `WARNING`.
- Proponowane indeksy/constraints do dodania.
- Krótki plan walidacji i rollback dla migracji.

## Uwagi operacyjne
- Przy zmianach DB/env/deploy zaktualizuj:
- `docs/team/operations/post-change-checklist.md`,
- `.env.example` (jeśli pojawiły się nowe zmienne),
- checklistę w `.github/PULL_REQUEST_TEMPLATE.md`.
