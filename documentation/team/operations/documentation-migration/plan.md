# Plan Optymalizacji Struktury Dokumentacji (Warstwy A-V)

> Cel: Fizyczne przeniesienie i uporządkowanie istniejących plików `.md` w repozytoriach Serwera (`PS-nodeJS`) i Klienta (`ENVI.ProjectSite`) zgodnie z architekturą Hub & Spoke (Warstwy A-V).

## Faza 1: Porządki na Serwerze (`PS-nodeJS`)

### Krok 1.1: Uporządkowanie Warstwy B (Pamięć Stanu)

- [x] Utwórz folder `documentation/team/operations/persons-v2-refactor/`
- [x] Utwórz folder `documentation/team/operations/hr-module/`
- [x] Utwórz folder `documentation/team/operations/profile-import/`
- [x] Zweryfikuj moduł `contract-meeting-notes` (`plan.md`, `progress.md`, `activity-log.md`).

### Krok 1.2: Inicjalizacja Warstwy V (Wizualizacje)

- [x] Utwórz folder `documentation/team/architecture/`
- [x] Dodaj pierwszy diagram wysokopoziomowy, np. `documentation/team/architecture/system-context.md`.

### Krok 1.3: Weryfikacja Warstwy C (Runbooki)

- [x] Zweryfikuj, że `documentation/team/runbooks/` i `documentation/team/onboarding/` nie zawierają plików plan/progress z Warstwy B.

## Faza 2: Porządki na Kliencie (`ENVI.ProjectSite`)

### Krok 2.1: Inicjalizacja Warstwy A (Instrukcje)

- [x] Upewnij się, że folder `instructions/` istnieje.
- [x] Zweryfikuj, że `instructions/docs-policy.md` istnieje.
- [x] Zweryfikuj brak luźnych instrukcji React/UI poza `instructions/`.

### Krok 2.2: Inicjalizacja Warstwy B (Pamięć Stanu)

- [x] Utwórz strukturę `docs/operations/`.
- [x] Utwórz `docs/operations/persons-v2-ui/` z plikami `plan.md`, `progress.md`, `activity-log.md`.

## Faza 3: Aktualizacja Wskaźników (S.O.T.)

- [x] Zaktualizuj `factory/DOCS-MAP.md` na serwerze.
- [x] Zaktualizuj `factory/AUDIT-SERVER.md` (sekcja struktury katalogów i indeks dokumentacji).
- [x] Zaktualizuj indeksy dokumentacji: `documentation/team/README.md`, `documentation/ai/README.md`.

## Faza 4: Normalizacja Referencji (pełna)

- [x] Podmień stare ścieżki płaskie na folderowe we wszystkich plikach `.md`:
    - `documentation/team/operations/*-plan.md` → `documentation/team/operations/*/plan.md`
    - `documentation/team/operations/*-progress.md` → `documentation/team/operations/*/progress.md`
    - `documentation/team/operations/*-activity-log.md` → `documentation/team/operations/*/activity-log.md`
- [x] Zweryfikuj brak trafień dla starych ścieżek globalnym wyszukiwaniem (`grep`).

## Kolejny krok (priorytet)

1. Potwierdzić spójność backend + frontend przez szybki audit linków w obu repo.
2. Utrzymywać już tylko model folderowy `plan/progress/activity-log` dla nowych strumieni.

---

Status: DONE
Last update: 2026-02-22
