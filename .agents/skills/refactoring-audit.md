---
name: refactoring-audit
description: >
  Audyt po refaktorze CRUD/Repository/Model: mapowanie SQL->Model, SELECT/JOIN, typy zwrotne,
  transakcje (ToolsDb.transaction), CRUD signatures, deprecated/backward compatibility.
  Używaj po każdym PR przenoszącym kod między warstwami lub zmieniającym mapowanie DB->Model.
---

# refactoring-audit - szybka kontrola jakości po refaktorze (obowiązkowa)

## Zasady nadrzędne
- Clean Architecture: router cienki, transakcje tylko w Controller, Repository bez logiki biznesowej, Model bez DB I/O.
- Jeśli audyt wykryje CRITICAL -> STOP i napraw przed merge.

## Wejście
- Zakres modułu (np. Persons / Accounts / Profiles).
- Lista zmienionych plików.
- Commit bazowy "przed refaktorem".

## Krok 0 - przygotowanie
1. Zidentyfikuj commit "przed refaktorem".
2. Wyeksportuj stare pliki/fragmenty do `tmp/audit/*` (`git show`).
3. Przejdź na aktualny stan i przygotuj pliki porównawcze.

## Krok 1 - mapowanie pól SQL -> Model (MUSI być 1:1)
- Porównaj listę `row.` w starej i nowej wersji.
- Różnice są dopuszczalne tylko jeśli:
- celowe,
- opisane w PR,
- pokryte testem.
- Braki nieuzasadnione = CRITICAL.

## Krok 2 - SQL (SELECT/JOIN/WHERE/ORDER BY)
- Porównaj SELECT i JOIN:
- brakujący JOIN = CRITICAL,
- zmiana `LEFT JOIN` -> `INNER JOIN` = CRITICAL (zmienia semantykę wyników).
- WHERE/ORDER BY muszą być logicznie równoważne, chyba że PR jawnie zmienia zachowanie.

## Krok 3 - konstruktory i typy zwrotne Repository
- Repository zwraca instancje Model (`T[]`), nie `TData[]`.
- W mapowaniu musi wystąpić `new ModelName({...})`.
- Dla obiektów zagnieżdżonych sprawdź konstrukcję i typy.

## Krok 4 - transakcje
- `ToolsDb.transaction` nie może być w Repository.
- Operacje wielokrokowe muszą mieć transakcję w Controller.
- Zweryfikuj propagację `externalConn` / `isPartOfTransaction`.

## Krok 5 - CRUD signatures i kolejność operacji
- `add/edit/delete` mają zgodne sygnatury lub mają ścieżkę migracji (deprecated).
- Kolejność operacji biznesowych i commit/rollback zachowana.

## Krok 6 - deprecated / backward compatibility
- Nie usuwaj od razu starych metod: oznacz `@deprecated` i wskaż migrację.
- Wyszukaj aktywne użycia starych metod i zaplanuj ich usunięcie etapami.

## Evidence (obowiązkowe do raportu)
Dołącz konkretny materiał dowodowy:
- użyte komendy (np. `rg`, `git show`, `diff`) i ich skrócone wyniki,
- wskazanie plików/linijek dla każdego CRITICAL/WARNING,
- listę plików zweryfikowanych ręcznie.

Minimum evidence:
1. Diff listy `row.` (przed vs po).
2. Diff zapytań SQL (`SELECT/JOIN/WHERE/ORDER BY`).
3. Wyszukiwanie `ToolsDb.transaction` w Controller i Repository.
4. Wyszukiwanie użyć metod deprecated.

## Output: raport audytu (do komentarza PR)
- Moduł / zakres.
- Werdykt: `PASS` / `FAIL`.
- CRITICAL (lista z plikami i liniami).
- WARNING (lista z plikami i liniami).
- Mapowanie pól: OK / braki.
- SQL/JOIN: OK / różnice.
- Typy zwrotne i konstruktory: OK / problemy.
- Transakcje: OK / problemy.
- Deprecated: OK / problemy.
- Następne kroki: konkretne poprawki i pliki.
