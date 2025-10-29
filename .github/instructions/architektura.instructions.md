---
applyTo: '**/*.ts'
description: 'Clean Architecture guidelines - PRIORITY: CRITICAL | ENFORCE: STRICT | Version: 2.0'
---

# Wytyczne Architektoniczne - Clean Architecture

> 📖 **Więcej:** [Szczegółowy przewodnik](./architektura-szczegoly.md) | [AI Assistant](./architektura-ai-assistant.md) | [Testowanie](./architektura-testowanie.md)

## 🎯 Filozofia

**Separation of Concerns** - każda warstwa ma jedno, dobrze zdefiniowane zadanie.
System oparty na **Clean Architecture** z jednokierunkowym przepływem zależności.

## 🚨 ZASADY OBOWIĄZKOWE (MUST)

AI: Te reguły są **nie negocjowalne** - zawsze enforce przy generowaniu/review kodu:

1. ❌ Model **NIE MOŻE** importować Controller ani Repository
2. ❌ Model **NIE MOŻE** wykonywać operacji I/O do **bazy danych**
3. ❌ Repository **NIE MOŻE** zawierać logiki biznesowej
4. ❌ Router **NIE MOŻE** tworzyć instancji Model ani wywoływać Repository
5. ❌ Validator **NIE MOŻE** być wewnątrz Router, Controller, Repository ani Model
6. ✅ Validator **MUSI BYĆ** osobną klasą (jeśli potrzebny)
7. ✅ Przepływ **MUSI BYĆ**: Router → (Validator) → Controller → Repository → Model
8. ✅ Controller **MUSI** zarządzać transakcjami (nie Repository)

## 📐 Przepływ Danych (OBOWIĄZKOWY)

```
Router → Validator (optional) → Controller → Repository → Model
         (transform)              (Service)                (Domain)
```

**Zasada:** Żadna warstwa NIE może komunikować się z warstwą "wyżej".

**Validator:** Osobna, opcjonalna klasa do walidacji/transformacji danych.

-   Wywoływana przez Router (transformacja danych HTTP) lub Controller (przed utworzeniem Model)
-   **NIE** jest warstwą - jest narzędziem używanym przez Router/Controller
-   **MUSI** być osobną klasą (nie może być wewnątrz innych warstw)

## 🏛️ Warstwy Architektoniczne

### **Router (HTTP Layer)**

**Rola:** Najcieńsza warstwa - tłumaczy HTTP na wywołania aplikacji.

✅ **Powinien:**

-   Definiować endpointy (`app.post('/items', ...)`)
-   Wywołać **jedną** metodę Controllera
-   Zwrócić odpowiedź HTTP (`res.send()`, `next(error)`)
-   Opcjonalnie wywołać Validator do wstępnej walidacji/transformacji danych

❌ **NIE powinien:**

-   Zawierać logiki biznesowej
-   Tworzyć instancji Model (`new Item()`)
-   Wywoływać Repository bezpośrednio

---

### **Validator (Validation Layer)**

**Rola:** Osobna klasa do walidacji danych (opcjonalna, jeśli potrzebna).

✅ **Powinien:**

-   Być **osobną klasą** (np. `LetterValidator`, `InvoiceValidator`)
-   Walidować atrybuty wymagane do określenia typu obiektu
-   Walidować spójność danych biznesowych
-   Dostarczać szczegółowe komunikaty błędów (diagnostyka)
-   Być **stateless** (tylko statyczne metody)
-   **Rzucać błędem** przy nieprawidłowych danych (nie naprawiać ich)

❌ **NIE powinien:**

-   Być **wewnątrz** Router, Controller, Repository ani Model
-   Zawierać logiki biznesowej (→ Model)
-   Wykonywać operacji I/O (baza danych, API)
-   Zależeć od innych Validatorów (każdy niezależny)
-   **Transformować/naprawiać** niepełnych danych (fail-fast zamiast fix)

**Lokalizacja:** Obok Model w warstwie domenowej (np. `src/letters/LetterValidator.ts`)

**Wywołanie:**

-   **Router** może wywołać dla wstępnej walidacji danych z HTTP
-   **Controller** wywołuje przed utworzeniem instancji Model
-   **NIE** wywoływany przez Model ani Repository

**Filozofia:** Validator **wymusza kompletność danych** - jeśli klient przesłał niepełne dane, to błąd, nie workaround.

**Przykład:**

```typescript
// ✅ DOBRZE - Validator jako osobna klasa
export default class LetterValidator {
    // Walidacja typu na podstawie danych z klienta
    // WAŻNE: Ta sama kolejność warunków co w LetterRepository.getLetterType()
    static validateLetterTypeData(initParam: any): ValidationResult {
        // 1. OurLetterContract (id == number && _project.id)
        if (initParam.isOur && initParam.id == initParam.number && initParam._project?.id) {
            return { isValid: true, expectedType: 'OurLetterContract' };
        }
        // 2. OurOldTypeLetter (id != number)
        if (initParam.isOur && initParam.id != initParam.number) {
            return { isValid: true, expectedType: 'OurOldTypeLetter' };
        }
        // 3. OurLetterOffer (isOur && _offer.id)
        if (initParam.isOur && initParam._offer?.id) {
            return { isValid: true, expectedType: 'OurLetterOffer' };
        }
        // 4. IncomingLetterContract (!isOur && _project.id)
        if (!initParam.isOur && initParam._project?.id) {
            return { isValid: true, expectedType: 'IncomingLetterContract' };
        }
        // 5. IncomingLetterOffer (!isOur && _offer.id)
        if (!initParam.isOur && initParam._offer?.id) {
            return { isValid: true, expectedType: 'IncomingLetterOffer' };
        }
        // Brak dopasowania - rzuć szczegółowy błąd
        return { isValid: false, errors: ['Missing _project.id or _offer.id'] };
    }

    // Walidacja spójności danych biznesowych
    static validateLetterData(letter: Letter): string[] { ... }
}

// Controller
const validation = LetterValidator.validateLetterTypeData(initParam);
if (!validation.isValid) {
    throw new Error(`Invalid letter data: ${validation.errors.join(', ')}`);
}
const letter = LettersController.createProperLetter(initParam);

// ❌ ŹLE - walidacja wewnątrz Model/Controller
class Letter {
    validate() { ... } // NIE - to łamie Single Responsibility
}
```

---

### **Controller (Application Layer)**

**Rola:** Orkiestruje operacje - koordynuje Repository i Model.

✅ **Powinien:**

-   Implementować use case (np. "dodaj nowe miasto")
-   Zarządzać transakcjami bazodanowymi
-   Wywoływać Repository do operacji CRUD
-   Wywoływać metody biznesowe na Model
-   Tworzyć instancje Model
-   Wywołać Validator przed utworzeniem instancji Model (jeśli Validator istnieje)

❌ **NIE powinien:**

-   Pisać zapytań SQL
-   Operować na `request`/`response`
-   Zawierać logiki biznesowej (→ Model)
-   Zawierać walidacji (→ Validator)

**Wzorzec:** Dziedziczy po `BaseController<T, R>` (Singleton + DI)

---

### **Repository (Data Access Layer)**

**Rola:** Jedyny punkt kontaktu z bazą danych.

✅ **Powinien:**

-   Implementować CRUD (Create, Read, Update, Delete)
-   Budować i wykonywać zapytania SQL
-   Mapować dane DB → Model (`mapRowToModel()`)
-   Obsługiwać polimorfizm zapisu/odczytu

❌ **NIE powinien:**

-   Zawierać logiki biznesowej
-   Wiedzieć o Controller czy Router
-   Koordynować innych Repository

**Wzorzec:** Dziedziczy po `BaseRepository<T>` (unikanie duplikacji CRUD)

---

### **Model (Domain Layer)**

**Rola:** Serce aplikacji - obiekty biznesowe i ich zachowanie.

✅ **Powinien:**

-   Definiować właściwości obiektu
-   Zawierać logikę biznesową i walidację
-   Otrzymywać dane przez parametry metod

❌ **NIE powinien:**

-   Importować Controller czy Repository
-   Wykonywać operacji I/O do **bazy danych**
-   Zawierać logiki HTTP

**Wyjątek I/O:** Model **MOŻE** mieć operacje na systemach zewnętrznych (Google Drive, Email),
jeśli Controller orkiestruje wywołanie. Zobacz [szczegóły](./architektura-szczegoly.md#model-io).

## 🔧 Wzorce Implementacyjne

### Validator (Optional)

**Kiedy używać:** Gdy potrzebna jest złożona walidacja lub transformacja danych.

```typescript
export default class EntityValidator {
    // Walidacja typu/struktury danych
    static validateEntityTypeData(initParam: any): ValidationResult {
        const result = { isValid: false, errors: [], missingFields: [] };
        // ... logika walidacji
        return result;
    }

    // Walidacja spójności danych biznesowych
    static validateEntityData(entity: Entity): string[] {
        const errors: string[] = [];
        // ... logika walidacji
        return errors;
    }

    // Transformacja/naprawa danych (workaround)
    static fixIncompleteData(initParam: any): boolean {
        // ... logika transformacji
        return true; // czy dane zostały naprawione
    }

    // Formatowanie błędów (diagnostyka)
    static formatValidationError(
        initParam: any,
        validation: ValidationResult
    ): string {
        // ... formatowanie komunikatu błędu
        return errorMessage;
    }
}
```

**Przykłady użycia:**

-   `LetterValidator` - walidacja typu Letter (OurLetter, IncomingLetter, etc.)
-   `InvoiceValidator` - walidacja danych faktury

### BaseRepository<T>

```typescript
abstract class BaseRepository<T> {
    async addInDb(item: T, conn?, isTransaction?): Promise<void>;
    async editInDb(item: T, conn?, isTransaction?, fields?): Promise<void>;
    async deleteFromDb(item: T): Promise<void>;
    abstract mapRowToModel(row: any): T;
    abstract find(conditions?): Promise<T[]>;
}
```

### BaseController<T, R>

```typescript
abstract class BaseController<T, R extends BaseRepository<T>> {
    protected repository: R;
    static getInstance(): this; // Singleton
}
```

## 📋 Zasady Refaktoringu

1. **Oznacz @deprecated** - nie usuwaj od razu
2. **Stwórz nową implementację** w odpowiedniej warstwie
3. **Migruj stopniowo** - Router → inne komponenty
4. **Usuń deprecated** po weryfikacji (grep/search)

## ✅ Checklist Przed Commitem

-   [ ] Przepływ: Router → (Validator) → Controller → Repository → Model
-   [ ] Model NIE importuje Controller/Repository
-   [ ] Repository NIE zawiera logiki biznesowej
-   [ ] Controller zarządza transakcjami
-   [ ] Validator jest **osobną klasą** (jeśli istnieje)
-   [ ] Validator NIE jest wewnątrz innych warstw
-   [ ] Brak cykli zależności (sprawdź: `madge`)

---

📚 **Więcej:** [Szczegółowy przewodnik z przykładami](./architektura-szczegoly.md)
