---
applyTo: '**/*.test.ts, **/*.spec.ts'
description: 'Testing Guidelines - Clean Architecture | Status: ACTIVE | Version: 1.0'
---

# Wytyczne Testowania - Clean Architecture

> 📅 **Status:** AKTYWNE - Framework wdrożony (Jest + ts-jest)
>
> 🏛️ **Architektura:** [Reguly warstw](./clean-architecture.md)

---

## 🚀 Quick Start

```bash
# Uruchom wszystkie testy
yarn test

# Tryb watch (automatyczne uruchamianie)
yarn test:watch

# Raport pokrycia kodu
yarn test:coverage

# Tylko testy konkretnego modułu
yarn test src/offers
```

**Dokumentacja:** `documentation/team/runbooks/testing.md`

---

## 🎯 Filozofia Testowania

**Każda warstwa jest testowana osobno** - zgodnie z zasadą Separation of Concerns.

```
Model (Unit Tests)
  ↓
Repository (Integration Tests)
  ↓
Controller (Integration Tests z mockami)
  ↓
Router (E2E Tests)
```

---

## 📋 Zasady Testowania Warstw

### **Model - Testy Jednostkowe (Unit Tests)**

✅ **Testuj:**

-   Logikę biznesową (walidacja, kalkulacje, transformacje)
-   Metody fabrykujące (`createSentEvent()`, `markAsSent()`)
-   Edge cases (null, undefined, wartości graniczne)

❌ **NIE testuj:**

-   Operacji I/O (GD, Email, DB) - mockuj je
-   Prostych getterów/setterów
-   Konstruktorów bez logiki

**Przykład:** `src/offers/__tests__/OurOffer.test.ts`

```typescript
// Mockuj zależności PRZED importami
jest.mock('../../BussinesObject');
jest.mock('../OfferRepository');

describe('OurOffer - Business Logic', () => {
    it('should create OfferEvent with SENT type', () => {
        const offer = new OurOffer({ ...testData });
        const event = offer.createSentEvent(eventData, editor);

        expect(event.eventType).toBe(Setup.OfferEventType.SENT);
        expect(event.offerId).toBe(offer.id);
    });
});
```

### **Repository - Testy Integracyjne**

✅ **Testuj:**

-   CRUD operations z prawdziwą bazą testową
-   Mapowanie `mapRowToModel()` (DB → Model)
-   Złożone zapytania SQL (JOIN, WHERE)

❌ **NIE testuj:**

-   Logiki biznesowej (→ Model)

**Status:** Testy integracyjne Repository są SKIPPED (oznaczone `it.skip()`) - wymagają konfiguracji testowej bazy danych.

**Przykład:** `src/offers/__tests__/OffersController.integration.test.ts`

### **Controller - Testy Jednostkowe Orkiestracji**

✅ **Testuj:**

-   Orkiestrację (prawidłowa kolejność wywołań)
-   Dispatcher pattern (routing po typie: `instanceof`)
-   Propagację błędów
-   Zarządzanie transakcjami

❌ **NIE testuj:**

-   Szczegółów SQL (→ Repository)
-   Logiki biznesowej (→ Model)

**Mockowanie Repository:**

```typescript
// Stwórz manual mock: src/offers/__mocks__/OfferRepository.ts
const mockRepository = {
    getFromDbList: jest.fn(),
    addInDb: jest.fn(),
    editInDb: jest.fn(),
    deleteFromDb: jest.fn(),
};

export default {
    getInstance: jest.fn(() => mockRepository),
};
```

**Przykład testu:**

```typescript
jest.mock('../OfferRepository');
jest.mock('../../persons/PersonsController');

describe('OffersController', () => {
    it('should orchestrate sendOurOffer with correct flow', async () => {
        // Arrange
        const mockGetPerson = jest.fn().mockResolvedValue(mockEditor);
        PersonsController.getPersonFromSessionUserData = mockGetPerson;

        // Act
        await OffersController.sendOurOffer(auth, offer, userData, eventData);

        // Assert - sprawdź kolejność wywołań
        expect(mockGetPerson).toHaveBeenCalledBefore(
            OfferEventsController.addNew
        );
        expect(OfferEventsController.sendMail).toHaveBeenCalledAfter(
            OfferEventsController.addNew
        );
    });
});
```

### **Router - Testy E2E**

**Status:** TODO - nie zaimplementowane (niski priorytet, logika jest w Controller)

---

## 🔧 Rozwiązane Problemy (Lessons Learned)

### **1. Circular Dependencies w Testach**

**Problem:** `BusinessObject` → `PersonsController` → `Person` → `BusinessObject`

**Rozwiązanie:** Manual mock w `src/__mocks__/BussinesObject.ts`

```typescript
// src/__mocks__/BussinesObject.ts
export default class BusinessObject {
    id?: number | string;
    _dbTableName: string;
    _editor?: any;
    editorId?: number;

    constructor(initParamObject: any) {
        this.id = initParamObject.id;
        this._dbTableName = initParamObject._dbTableName;
        this._editor = initParamObject._editor;
        this.editorId = this._editor?.id;
    }
}
```

Użycie w testach:

```typescript
jest.mock('../../BussinesObject'); // Automatycznie użyje __mocks__/BussinesObject.ts
```

### **2. Static Repository Initialization**

**Problem:** `OffersController` ma `private static repository = OfferRepository.getInstance()` - wywołanie przy ładowaniu modułu.

**Rozwiązanie:** Manual mock w `src/offers/__mocks__/OfferRepository.ts` z `getInstance()`.

### **3. Strict TypeScript w Test Data**

**Problem:** Testy wymagają pełnych obiektów zgodnych z interfejsami.

**Rozwiązanie:**

```typescript
// ✅ Poprawnie - pełny obiekt wymaganych pól
const offer = new OurOffer({
    alias: 'TEST-001',
    _type: { id: 1 },
    _city: { id: 1 },
    employerName: 'Test Employer'
} as any);

// ✅ Dla partial data - użyj type assertion
const eventData = {...} as unknown as OfferEventData;
```

### **4. Testowanie Dispatcher Pattern**

**Wzorzec:** Controller sprawdza `instanceof` i deleguje do metod prywatnych.

```typescript
describe('delete (dispatcher)', () => {
    it('should call deleteOurOffer for OurOffer instance', async () => {
        const ourOffer = new OurOffer({...});
        jest.spyOn(OffersController as any, 'deleteOurOffer').mockResolvedValue(undefined);

        await OffersController.delete(auth, ourOffer, userData);

        expect(OffersController['deleteOurOffer']).toHaveBeenCalledWith(auth, ourOffer, userData);
    });
});
```

---

## 📊 Struktura Katalogów

```
src/
├── __mocks__/                          # Global mocks
│   └── BussinesObject.ts               # Mock dla circular dependencies
├── __tests__/
│   └── setup.ts                        # Global setup (console mocking)
├── offers/
│   ├── __mocks__/                      # Module-specific mocks
│   │   └── OfferRepository.ts
│   ├── __tests__/
│   │   ├── OurOffer.test.ts           # Unit: business logic
│   │   ├── OffersController.test.ts   # Unit: orchestration
│   │   └── OffersController.integration.test.ts  # Integration (skipped)
│   ├── Offer.ts
│   ├── OurOffer.ts
│   ├── OffersController.ts
│   └── OfferRepository.ts
└── persons/
    └── __mocks__/
        └── PersonsController.ts
```

**Konwencje:**

-   `__tests__/` - testy jednostkowe/integracyjne
-   `__mocks__/` - manual mocks dla Jest
-   `*.test.ts` - testy jednostkowe
-   `*.integration.test.ts` - testy integracyjne (z DB)
-   `*.e2e.test.ts` - testy end-to-end (opcjonalne)

---

## ⚙️ Konfiguracja (Jest + ts-jest)

**Pliki:**

-   `jest.config.js` - konfiguracja Jest
-   `tsconfig.test.json` - TypeScript config dla testów
-   `src/__tests__/setup.ts` - global setup

**Dependencies:**

```json
{
    "jest": "^30.2.0",
    "@types/jest": "^30.0.0",
    "ts-jest": "^29.4.5",
    "@jest/globals": "^30.2.0"
}
```

**Instalacja:** `yarn add --dev jest @types/jest ts-jest @jest/globals`

---

## ✅ Poziomy Pewności Testów

### ⭐⭐⭐ **Wysoka Pewność (Testy Jednostkowe)**

✅ Architektura zgodna z Clean Architecture
✅ Logika biznesowa działa poprawnie
✅ Orkiestracja w Controller jest poprawna
✅ Dispatcher routing działa

### ⭐⭐ **Średnia Pewność (Brak Testów Integracyjnych)**

⚠️ Zapytania SQL w Repository nie są przetestowane z prawdziwą bazą
⚠️ Pełny flow (Router → Controller → Repo → DB) nie jest przetestowany

### ⭐ **Niska Pewność (Brak E2E)**

❌ Interakcje z Google Drive API nie są przetestowane
❌ Endpointy HTTP nie są przetestowane

**Wniosek:** Obecne testy dają wysoką pewność dla refaktoringu i logiki biznesowej, ale wymagają uzupełnienia o testy integracyjne dla 100% gwarancji.

---

## 🎓 Dobre Praktyki

1. **Mock wszystkie zewnętrzne zależności** w testach jednostkowych (DB, GD, Email, inne Controllery)
2. **Testuj zachowanie, nie implementację** - sprawdzaj wyniki, nie wywołania wewnętrzne
3. **Jeden test = jedna rzecz** - testy powinny być proste i czytelne
4. **Używaj `describe()` do grupowania** - logiczna struktura testów
5. **Testy muszą być szybkie** (<20s dla wszystkich) - mockuj ciężkie operacje
6. **Każdy test jest niezależny** - nie polegaj na kolejności wykonania
7. **Manual mocks dla circular dependencies** - użyj `__mocks__/` dla problematycznych modułów

---

## 📚 Dodatkowe Zasoby

-   **Dokumentacja testow:** `documentation/team/runbooks/testing.md` (podstawy + szczegoly + metryki)
-   **Przykłady:** `src/offers/__tests__/` (referencyjne testy)

---

**Wersja:** 1.0
**Status:** AKTYWNE - Framework wdrożony i przetestowany
**Ostatnia aktualizacja:** 2025-11-09
**Autor:** oramm + GitHub Copilot

---

## 🔮 Co Dalej (Roadmap)

### Priorytet 1 (Krótkoterminowy)

-   [ ] Dodać testy dla `add()` i `edit()` w OffersController
-   [ ] Zwiększyć pokrycie do 80%+ dla warstwy Controller
-   [ ] Dodać testy dla ExternalOffer business logic

### Priorytet 2 (Średnioterminowy)

-   [ ] Skonfigurować testową bazę danych
-   [ ] Uruchomić testy integracyjne (odskipować `.skip()`)
-   [ ] Dodać testy Repository z prawdziwym DB

### Priorytet 3 (Długoterminowy)

-   [ ] E2E testy dla krytycznych endpointów
-   [ ] CI/CD pipeline z automatycznym uruchamianiem testów
-   [ ] Mutation testing dla weryfikacji jakości testów
