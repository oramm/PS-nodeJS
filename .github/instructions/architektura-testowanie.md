---
applyTo: '**/*.test.ts, **/*.spec.ts'
description: 'Testing Guidelines - Clean Architecture | Status: PLANNED | Version: 0.1 (Draft)'
---

# Wytyczne Testowania - Clean Architecture

> 📅 **Status:** PLANOWANE - Do uzupełnienia po napisaniu pierwszych testów
>
> 🏛️ **Architektura:** [Podstawy](./architektura.instructions.md) | [Szczegóły](./architektura-szczegoly.md) | [AI Assistant](./architektura-ai-assistant.md)

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

## 📋 Ogólne Zasady (TODO - do uzupełnienia)

### **Model - Testy Jednostkowe**

✅ **Testuj:**

-   Logikę biznesową (walidacja, kalkulacje)
-   Metody generujące dane (`generateNumber()`, `calculateTotal()`)
-   Edge cases (puste wartości, null, wartości graniczne)

❌ **NIE testuj:**

-   Operacji I/O (GD, Email) - mockuj je
-   Getterów/setterów bez logiki

### **Repository - Testy Integracyjne**

✅ **Testuj:**

-   CRUD operations (`addInDb()`, `find()`, `editInDb()`)
-   Mapowanie DB → Model (`mapRowToModel()`)
-   Złożone zapytania SQL

❌ **NIE testuj:**

-   Logiki biznesowej (→ Model)

**TODO:** Zdecydować:

-   Testowa baza danych vs mockowanie `ToolsDb`
-   Strategia rollback transakcji

### **Controller - Testy Integracyjne**

✅ **Testuj:**

-   Orkiestrację operacji
-   Zarządzanie transakcjami
-   Wywołania Repository + Model

**TODO:** Przykłady mockowania:

```typescript
// Przykład (do uzupełnienia po pierwszych testach)
const mockRepository = {
    addInDb: jest.fn(),
    find: jest.fn(),
};
```

### **Router - Testy E2E**

✅ **Testuj:**

-   Endpointy HTTP
-   Statusy odpowiedzi
-   Walidacja request/response

**TODO:** Framework (Supertest? innych?)

---

## 🔧 Wzorce do Udokumentowania (TODO)

### **1. Mockowanie Repository w Controller**

```typescript
// TODO: Przykład po napisaniu pierwszego testu
```

### **2. Testowanie Polimorfizmu (OurLetter vs IncomingLetter)**

```typescript
// TODO: Jak testować różne typy Letter?
```

### **3. Transakcje w Testach**

```typescript
// TODO: Strategia rollback po każdym teście
```

### **4. Mockowanie External APIs (Google Drive, Gmail)**

```typescript
// TODO: Mockowanie ToolsGd, ToolsEmail
```

---

## 📊 Struktura Katalogów (Propozycja)

```
src/
├── letters/
│   ├── Letter.ts
│   ├── Letter.test.ts              ← Testy jednostkowe Model
│   ├── LetterRepository.ts
│   ├── LetterRepository.test.ts    ← Testy integracyjne Repo
│   ├── LettersController.ts
│   ├── LettersController.test.ts   ← Testy integracyjne Controller
│   └── LettersRouters.test.ts      ← Testy E2E Router
```

---

## ✅ Checklist Przed Rozpoczęciem Testowania

-   [ ] Zdecyduj o frameworku (Jest? Mocha? Vitest?)
-   [ ] Skonfiguruj testową bazę danych (lub mockowanie)
-   [ ] Napisz 2-3 przykładowe testy (Model, Repository, Controller)
-   [ ] Udokumentuj wzorce, które zadziałały
-   [ ] Zaktualizuj ten plik z rzeczywistymi przykładami

---

## 🔗 Dodatkowe Zasoby (TODO)

-   [ ] Link do dokumentacji frameworka testowego
-   [ ] Przykłady testów z podobnych projektów
-   [ ] Strategia CI/CD dla testów

---

**Wersja:** 0.1 (Draft)  
**Status:** PLANOWANE - czeka na implementację pierwszych testów  
**Ostatnia aktualizacja:** 2024-10-28  
**Autor:** oramm

---

## 💡 Jak Uzupełnić Ten Dokument

1. ✅ Napisz 2-3 testy (Model, Repository, Controller)
2. ✅ Znajdź wzorce, które działają w Twoim projekcie
3. ✅ Zastąp TODO rzeczywistymi przykładami kodu
4. ✅ Dodaj sekcje o problemach, które napotkałeś
5. ✅ Zmień status z "PLANOWANE" na "ACTIVE"
