# Backlog naprawczy po audycie architecture docs

Data utworzenia: 2026-02-23  
Data aktualizacji: 2026-02-23  
Zrodlo: `documentation/team/operations/architecture-doc-audit/Audit-Architecture-Report.md`

## Zamkniete w opcji 3 (DONE)

1. Critical #1 - martwe linki `architektura-*` i usuniete aliasy
- Status: DONE (2026-02-23)
- Wynik:
  - `MISSING_LINKS_TOTAL: 37 -> 0`
  - `MISSING_LINKS_UNIQUE: 9 -> 0`
- Dowody:
  - `documentation/team/architecture/clean-architecture.md:8`
  - `documentation/team/architecture/ai-decision-trees.md:10`
  - `documentation/team/architecture/testing-per-layer.md:10`
  - `documentation/team/architecture/refactoring-audit.md:10`

2. Critical #2 - polityka `target pattern vs legacy tolerated`
- Status: DONE (2026-02-23) - dokumentacyjnie
- Wynik:
  - jawne sekcje `Target pattern`, `Legacy tolerated`, `Migration policy`, `Blockers for new code`
  - usunieta niejednoznacznosc co jest MUST od teraz vs debt legacy
- Dowody:
  - `documentation/team/architecture/clean-architecture.md:15`
  - `documentation/team/architecture/clean-architecture.md:24`
  - `documentation/team/architecture/clean-architecture.md:33`
  - `documentation/team/architecture/clean-architecture.md:40`
  - `documentation/team/architecture/ai-decision-trees.md:14`

3. Synchronizacja canonical -> adapter (C8)
- Status: DONE (2026-02-23)
- Wynik:
  - `.github/instructions/architektura.instructions.md` odchudzony do thin adapter
  - adapter odsyla do canonical i nie duplikuje pelnych zasad
- Dowody:
  - `.github/instructions/architektura.instructions.md:1`
  - `.github/instructions/architektura.instructions.md:13`
  - `.github/instructions/architektura.instructions.md:22`
  - `.github/instructions/architektura.instructions.md:37`

## Otwarte po opcji 3

1. High - governance cadence dla canonical -> adapter
- Status: OPEN
- Problem:
  - brak automatycznego cyklu kontroli dryfu i dedykowanego alarmu CI.
- Definition of Done:
  - jawny owner + cadence przegladu,
  - alarm dla zmian adaptera bez aktualizacji canonical.

2. Medium - automatyzacja QA docs
- Status: OPEN
- Zadania:
  - dodac prosty skaner linkow docs do procesu QA,
  - dodac skaner dryfu canonical/adapters.

3. Medium - dalsza migracja kodu legacy do target pattern
- Status: OPEN
- Problem:
  - dokumentacja jest juz jednoznaczna, ale kod legacy nadal wystepuje.
- Definition of Done:
  - migracja wg zasady `touch-and-migrate` podczas kolejnych zmian modulowych.

## Priorytety kolejnej iteracji

1. High governance cadence
2. Medium automatyzacja QA docs
3. Medium migracje kodu legacy