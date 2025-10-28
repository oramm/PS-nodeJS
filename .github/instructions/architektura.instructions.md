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
5. ✅ Przepływ **MUSI BYĆ**: Router → Controller → Repository → Model
6. ✅ Controller **MUSI** zarządzać transakcjami (nie Repository)

## 📐 Przepływ Danych (OBOWIĄZKOWY)

```
Router → Controller → Repository → Model
         (Service)                 (Domain)
```

**Zasada:** Żadna warstwa NIE może komunikować się z warstwą "wyżej".

## 🏛️ Warstwy Architektoniczne

### **Router (HTTP Layer)**

**Rola:** Najcieńsza warstwa - tłumaczy HTTP na wywołania aplikacji.

✅ **Powinien:**

-   Definiować endpointy (`app.post('/items', ...)`)
-   Wywołać **jedną** metodę Controllera
-   Zwrócić odpowiedź HTTP (`res.send()`, `next(error)`)

❌ **NIE powinien:**

-   Zawierać logiki biznesowej
-   Tworzyć instancji Model (`new Item()`)
-   Wywoływać Repository bezpośrednio

---

### **Controller (Application Layer)**

**Rola:** Orkiestruje operacje - koordynuje Repository i Model.

✅ **Powinien:**

-   Implementować use case (np. "dodaj nowe miasto")
-   Zarządzać transakcjami bazodanowymi
-   Wywoływać Repository do operacji CRUD
-   Wywoływać metody biznesowe na Model
-   Tworzyć instancje Model

❌ **NIE powinien:**

-   Pisać zapytań SQL
-   Operować na `request`/`response`
-   Zawierać logiki biznesowej (→ Model)

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

-   [ ] Przepływ: Router → Controller → Repository → Model
-   [ ] Model NIE importuje Controller/Repository
-   [ ] Repository NIE zawiera logiki biznesowej
-   [ ] Controller zarządza transakcjami
-   [ ] Brak cykli zależności (sprawdź: `madge`)

---

📚 **Więcej:** [Szczegółowy przewodnik z przykładami](./architektura-szczegoly.md)
