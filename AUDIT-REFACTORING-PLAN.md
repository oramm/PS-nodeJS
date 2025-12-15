# Plan Dokończenia Refaktoryzacji Architektury

**Status:** W trakcie realizacji
**Data aktualizacji:** 2025-12-15

## 1. Moduł `Persons` (✅ ZAKOŃCZONE)

-   [x] Ujednolicenie API Controllera (`addFromDto`, `editFromDto`, `deleteFromDto`)
-   [x] Refaktoryzacja endpointu `/user/:id` (usunięcie `gapiReguestHandler`)
-   [x] Przeniesienie orkiestracji ScrumSheet do Controllera (`editUserFromDto`)
-   [x] Oznaczenie starych metod jako `@deprecated`

### ⚠️ Dług Technologiczny (TODO)

W `PersonsController.ts` zastosowano `await import()` dla modułów ScrumSheet, aby uniknąć cyklu zależności (`ScrumSheet` → `PersonsController` → `ScrumSheet`).

-   **Zadanie:** Rozwiązać cykl zależności przy okazji refaktoryzacji modułu ScrumSheet.
-   **Cel:** Usunąć dynamiczny import i użyć Dependency Injection lub wydzielić wspólny interfejs.

---

## 2. Moduł `FinancialAidProgrammes` (🚧 DO ZROBIENIA)

**Cel:** Eliminacja `ToolsGapi.gapiReguestHandler` i parametru `auth` w publicznym API.

### Kroki:

1.  **Controller:**
    -   Dodać metody `addFromDto`, `editFromDto`, `deleteFromDto` używające `withAuth`.
    -   Przenieść logikę GD do prywatnych metod (np. `addPrivate(auth, data)`).
    -   Oznaczyć stare metody (`addNew...`, `update...`) jako `@deprecated`.
2.  **Router:**
    -   Zamienić `gapiReguestHandler` na bezpośrednie wywołania nowych metod Controllera.
    -   Ujednolicić obsługę błędów (`next(error)`).

---

## 3. Moduł `ScrumSheet` (📅 PLANOWANE)

**Status:** Wymaga osobnej analizy architektonicznej.

**Problem:** Moduł to zbiór klas statycznych (`ScrumSheet`, `CurrentSprint`, `Planning`) silnie sprzęgniętych z Google API. Nie jest to typowy `BusinessObject`.

### Plan:

1.  **Analiza:** Określić czy `ScrumSheet` powinien być:
    -   Serwisem infrastrukturalnym (jak `ToolsGd`)?
    -   Czy dedykowanym Kontrolerem (`ScrumSheetController` extends `BaseController`)?
2.  **Refaktoryzacja:**
    -   Wyeliminować przekazywanie `auth` przez wszystkie warstwy.
    -   Zastosować wzorzec `withAuth` (w nowym kontrolerze lub wewnątrz serwisu).
    -   Rozwiązać cykl zależności z `PersonsController` (patrz pkt 1).

---

## 4. Dokumentacja i Testy

-   [ ] Zaktualizować `TESTING.md` o informację, że zrefaktoryzowane metody wymagają uzupełnienia testów jednostkowych.
-   [ ] Zweryfikować typowanie w nowych metodach `*FromDto` (wprowadzić interfejsy DTO zamiast `any`).
