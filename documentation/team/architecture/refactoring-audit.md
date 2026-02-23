---
applyTo: '**/*.ts'
description: 'Refactoring Audit Checklist - Quality Assurance Post-Refactoring | Version: 1.0'
---

# Audyt Refaktoryzacji - Przewodnik Weryfikacji

> 📋 **Cel:** Upewnić się, że refaktoryzacja nie utraciła funkcjonalności, danych ani logiki biznesowej
>
> 🏛️ **Powiązane:** [Podstawy](./clean-architecture.md) | [Szczegóły](./clean-architecture-details.md) | [AI Assistant](./ai-decision-trees.md)

---

## 🎯 Kiedy Przeprowadzać Audyt?

Audyt **OBOWIĄZKOWY** po każdej refaktoryzacji, która:

-   ✅ Przenosi kod między warstwami (Model → Controller → Repository)
-   ✅ Zmienia sposób mapowania danych (SQL → Model)
-   ✅ Modyfikuje transakcje bazodanowe
-   ✅ Usuwa lub oznacza metody jako `@deprecated`
-   ✅ Zmienia przepływ danych w CRUD

---

## 📋 Checklist Audytu (6 Obszarów)

### **1️⃣ Mapowanie Pól SQL → Model**

**Cel:** Upewnić się, że żadne pole z bazy danych nie zostało pominięte.

#### **Metodologia:**

```bash
# Krok 1: Wylistuj wszystkie pola SELECT w STAREJ wersji
git show HEAD:src/path/to/OldController.ts | grep "row\." | sort

# Krok 2: Wylistuj wszystkie pola SELECT w NOWEJ wersji
grep "row\." src/path/to/NewRepository.ts | sort

# Krok 3: Porównaj obie listy
```

#### **Checklist:**

-   [ ] **Pola proste** (id, name, status, etc.) - wszystkie zmapowane?
-   [ ] **Pola z transformacją** (np. `ToolsDb.sqlToString(row.Name)`) - transformacja zachowana?
-   [ ] **Pola zagnieżdżone** (np. `_contract`, `_type`) - pełna struktura zachowana?
-   [ ] **Pola opcjonalne** (np. `description?: string`) - nullability zachowana?
-   [ ] **Aliasy SQL** (np. `row.DateId` → `id`) - poprawnie zmapowane?

#### **Przykład Weryfikacji:**

```typescript
// ✅ PRZED (OldController.ts)
const item = {
    id: row.DateId,
    startDate: row.StartDate,
    endDate: row.EndDate,
    milestoneId: row.Id,
    description: row.DateDescription,
    lastUpdated: row.DateLastUpdated,
};

// ✅ PO (NewRepository.ts)
const item = new MilestoneDate({
    id: row.DateId, // ✅ Zachowane
    startDate: row.StartDate, // ✅ Zachowane
    endDate: row.EndDate, // ✅ Zachowane
    milestoneId: row.Id, // ✅ Zachowane
    description: row.DateDescription, // ✅ Zachowane
    lastUpdated: row.DateLastUpdated, // ✅ Zachowane
});
```

---

### **2️⃣ Konstruktory i Instancje Klas**

**Cel:** Upewnić się, że zwracane są **instancje klas**, nie plain objects.

#### **Checklist:**

-   [ ] Repository zwraca `T[]` (instancje Model), nie `TData[]` (plain objects)
-   [ ] Każdy wiersz z bazy jest mapowany przez `new Model({...})`
-   [ ] Zagnieżdżone obiekty też używają konstruktorów (np. `new Contract(...)`)
-   [ ] Polimorfizm zachowany (np. `ContractOur` vs `ContractOther`)

#### **Przykład Weryfikacji:**

```typescript
// ❌ ZŁE - zwraca plain objects
async find(): Promise<MilestoneDateData[]> {
    const result = await ToolsDb.getQueryCallbackAsync(sql);
    return result.map(row => ({  // ❌ Plain object
        id: row.Id,
        startDate: row.StartDate
    }));
}

// ✅ DOBRE - zwraca instancje klas
async find(): Promise<MilestoneDate[]> {
    const result = await ToolsDb.getQueryCallbackAsync(sql);
    return result.map(row => new MilestoneDate({  // ✅ Instancja klasy
        id: row.Id,
        startDate: row.StartDate
    }));
}
```

#### **Weryfikacja w Kodzie:**

```bash
# Sprawdź czy są wywołania konstruktorów
grep -r "new ModelName\(" src/path/to/repository/

# Sprawdź return type w Repository
grep -A 5 "async find" src/path/to/repository/
```

---

### **3️⃣ Zapytania SQL (SELECT, JOIN, WHERE)**

**Cel:** Upewnić się, że zapytania SQL są **identyczne** przed i po.

#### **Checklist:**

-   [ ] **SELECT** - wszystkie kolumny zachowane? (w tej samej kolejności nie musi być)
-   [ ] **FROM** - ta sama tabela?
-   [ ] **JOIN** - wszystkie JOINy zachowane? (LEFT/INNER/RIGHT bez zmian)
-   [ ] **WHERE** - warunki identyczne?
-   [ ] **ORDER BY** - sortowanie zachowane?
-   [ ] **Aliasy tabel** - bez zmian (np. `MainContracts`, `RelatedOurContractsData`)

#### **Metodologia:**

```bash
# Porównaj SELECT
git show HEAD:src/old/Controller.ts | grep "SELECT" -A 50
grep "SELECT" src/new/Repository.ts -A 50

# Porównaj JOIN
git show HEAD:src/old/Controller.ts | grep "LEFT JOIN"
grep "LEFT JOIN" src/new/Repository.ts
```

#### **Red Flags 🚨:**

-   ❌ Brakuje JOIN → dane niekompletne
-   ❌ Zmieniono LEFT JOIN na INNER JOIN → filtrowanie zmienione
-   ❌ Brakuje kolumny w SELECT → pole nigdy nie będzie zmapowane
-   ❌ Zmieniono ORDER BY → kolejność wyników inna

---

### **4️⃣ Funkcjonalność CRUD (Create, Read, Update, Delete)**

**Cel:** Upewnić się, że operacje CRUD działają **identycznie**.

#### **Checklist - CREATE:**

-   [ ] Parametry metody `add()` identyczne?
-   [ ] Kolejność operacji zachowana? (np. createFolders → DB → createDefaultCases)
-   [ ] Transakcje zachowane?
-   [ ] Rollback przy błędzie działa?

#### **Checklist - READ:**

-   [ ] Metoda `find()` przyjmuje te same parametry?
-   [ ] Filtrowanie identyczne (OR conditions, AND conditions)?
-   [ ] Paginacja zachowana (jeśli była)?

#### **Checklist - UPDATE:**

-   [ ] Parametr `fieldsToUpdate` obsługiwany?
-   [ ] Logika częściowej aktualizacji (tylko wybrane pola) zachowana?
-   [ ] Transakcje zachowane?

#### **Checklist - DELETE:**

-   [ ] Parametry identyczne?
-   [ ] Cascade delete zachowane (jeśli było)?
-   [ ] Rollback działą?

#### **Przykład Weryfikacji:**

```typescript
// ✅ PRZED
await item.editController(userData, ['status', 'description']);

// ✅ PO - parametry identyczne
await Controller.edit(item, userData, ['status', 'description']);

// Sprawdź implementację:
// PRZED:
async editController(userData, fieldsToUpdate?) {
    return await this.editInDb(undefined, false, fieldsToUpdate);
}

// PO:
static async edit(item, userData?, fieldsToUpdate?) {
    await repository.editInDb(item, undefined, false, fieldsToUpdate);
    //                                          ^^^^^ Parametry 1:1
}
```

---

### **5️⃣ Obsługa Transakcji Bazodanowych**

**Cel:** Upewnić się, że transakcje są **poprawnie zarządzane**.

#### **Checklist:**

-   [ ] Controller (nie Repository) zarządza transakcjami?
-   [ ] `ToolsDb.transaction()` wywoływane w Controller?
-   [ ] Parametry `externalConn` i `isPartOfTransaction` przekazywane poprawnie?
-   [ ] Rollback automatyczny przy błędzie?
-   [ ] Kolejność operacji w transakcji zachowana?

#### **Przykład Weryfikacji:**

```typescript
// ✅ DOBRE - Controller zarządza transakcją
class Controller {
    static async add(milestone: Milestone) {
        return await ToolsDb.transaction(async (conn) => {
            // 1. Dodaj główny rekord
            await repository.addInDb(milestone, conn, true);
            // 2. Dodaj asocjacje
            await milestone.addDatesInDb(conn, true);
            return milestone;
        }); // Automatyczny commit/rollback
    }
}

// ❌ ZŁE - Repository zarządza transakcją
class Repository {
    async addWithDates(milestone: Milestone) {
        await ToolsDb.transaction(async (conn) => {
            // ❌ W Repository!
            await this.addInDb(milestone, conn);
            await this.addDates(milestone, conn);
        });
    }
}
```

#### **Weryfikacja:**

```bash
# Sprawdź kto wywołuje transaction
grep -r "ToolsDb.transaction" src/path/to/module/
# Powinno być tylko w Controller, nie w Repository
```

---

### **6️⃣ Backward Compatibility (Deprecated Methods)**

**Cel:** Upewnić się, że stary kod **nadal działa**.

#### **Checklist:**

-   [ ] Deprecated metody **NIE zostały usunięte**?
-   [ ] Deprecated metody mają adnotację `@deprecated` z instrukcją migracji?
-   [ ] Deprecated metody delegują do nowej implementacji (jeśli możliwe)?
-   [ ] Stare wywołania w Router/Controller zostały zrefaktoryzowane?

#### **Przykład Weryfikacji:**

```typescript
// ✅ DOBRE - deprecated zachowany z delegacją
class Model {
    /**
     * @deprecated Użyj Controller.edit() zamiast tego.
     * Migracja: await Controller.edit(item, userData, fields);
     */
    async editController(userData, fields?) {
        return await this.editInDb(undefined, false, fields);
        // ✅ Stara logika zachowana - działa jak wcześniej
    }
}

// ❌ ZŁE - usunięto od razu
// class Model {
//     // async editController() - USUNIĘTE ❌
// }
```

#### **Sprawdzenie Użycia Deprecated:**

```bash
# Znajdź wszystkie użycia deprecated metody
grep -r "\.editController\(" src/

# Jeśli są użycia poza testami - trzeba zrefaktoryzować
```

---

## 🔍 Metodologia Audytu Krok po Kroku

### **Przygotowanie:**

```bash
# 1. Zapisz stan PRZED refaktoryzacją
git stash save "WIP: refactoring"
git log --oneline -n 5  # Znajdź commit przed refaktoryzacją

# 2. Wyeksportuj stary kod
git show HEAD~1:src/path/to/OldFile.ts > /tmp/old_file.ts

# 3. Przywróć zmiany
git stash pop
```

### **Audyt:**

#### **Krok 1: Porównaj Pola SQL**

```bash
# STARY
grep "row\." /tmp/old_file.ts | sort | uniq > /tmp/old_fields.txt

# NOWY
grep "row\." src/path/to/NewRepository.ts | sort | uniq > /tmp/new_fields.txt

# PORÓWNAJ
diff /tmp/old_fields.txt /tmp/new_fields.txt
```

**Oczekiwany wynik:** Brak różnic (lub tylko zmiany kolejności).

#### **Krok 2: Porównaj SQL Queries**

```bash
# STARY
git show HEAD~1:src/old/Controller.ts | grep -A 100 "SELECT"

# NOWY
grep -A 100 "SELECT" src/new/Repository.ts
```

**Oczekiwany wynik:** Identyczny SELECT + JOIN + WHERE + ORDER BY.

#### **Krok 3: Sprawdź Konstruktory**

```bash
# Znajdź wszystkie `new Model(`
grep -r "new ModelName\(" src/path/to/repository/
```

**Oczekiwany wynik:** Co najmniej 1 wywołanie w `mapRowToModel()` lub `processFooResult()`.

#### **Krok 4: Sprawdź Transakcje**

```bash
# Znajdź transaction w Repository (nie powinno być)
grep -r "ToolsDb.transaction" src/path/to/repository/

# Znajdź transaction w Controller (powinno być)
grep -r "ToolsDb.transaction" src/path/to/controller/
```

#### **Krok 5: Weryfikuj CRUD**

Dla każdej metody (add, edit, delete):

```typescript
// Porównaj PRZED:
git show HEAD~1:src/old/Model.ts | grep -A 20 "async editController"

// Z NOWYM:
grep -A 20 "static async edit" src/new/Controller.ts
```

**Sprawdź:**

-   Parametry identyczne?
-   Wywołania `editInDb()` z tymi samymi parametrami?
-   Kolejność operacji zachowana?

#### **Krok 6: Sprawdź Deprecated Usage**

```bash
# Znajdź deprecated metody
grep -r "@deprecated" src/path/to/module/

# Dla każdej znalezionej metody - sprawdź użycie:
grep -r "\.methodName\(" src/
```

**Oczekiwany wynik:**

-   Deprecated metody istnieją w Model
-   Są używane tylko w starych miejscach (lub wcale)
-   Nowy kod używa Controller

---

## 📊 Szablon Raportu Audytu

Po przeprowadzeniu audytu, stwórz raport:

```markdown
## 📋 RAPORT AUDYTU REFAKTORYZACJI - [ModuleName]

**Data:** YYYY-MM-DD
**Audytor:** [Imię] / AI Assistant
**Moduł:** [ModuleName] (Controller + Repository + Model)

---

### ✅ **1. Mapowanie Pól SQL → Model**

**Pola główne:**

-   ✅ `id: row.Id` - zachowane
-   ✅ `name: ToolsDb.sqlToString(row.Name)` - transformacja zachowana
-   ✅ `status: row.Status` - zachowane
    [... wszystkie pola]

**Pola zagnieżdżone (\_contract, \_type, etc.):**

-   ✅ `_contract.id: row.ContractId` - zachowane
-   ✅ `_contract._admin: {...}` - pełna struktura zachowana
    [... wszystkie zagnieżdżenia]

**Werdykt:** ✅ **100% pól zachowanych** / ❌ **Brakuje: [lista]**

---

### ✅ **2. Konstruktory i Instancje Klas**

**Wywołania konstruktorów:**

1. ✅ `new ModelName({...})` - linia 55 (mapRowToModel)
2. ✅ `new ModelName({...})` - linia 325 (processResult)
3. ✅ `new ContractOur(...)` - polimorfizm zachowany

**Zwracany typ:**

-   ✅ Repository.find() → `Promise<ModelName[]>` (instancje, nie Data[])

**Werdykt:** ✅ **Wszystkie konstruktory wywołane poprawnie**

---

### ✅ **3. Zapytania SQL**

**SELECT:**

-   ✅ Wszystkie 42 pola zachowane

**JOIN:**

-   ✅ 12 JOINów (LEFT JOIN) - wszystkie zachowane
-   ✅ Aliasy tabel identyczne (MainContracts, RelatedOurContractsData)

**WHERE:**

-   ✅ Warunki identyczne (OR groups + typeCondition)

**ORDER BY:**

-   ✅ Sortowanie zachowane: `EndDate, ContractId, FolderNumber ASC`

**Werdykt:** ✅ **100% zgodność SQL**

---

### ✅ **4. Funkcjonalność CRUD**

**CREATE (add):**

-   ✅ Parametry identyczne
-   ✅ Kolejność operacji: createFolders → DB → createDefaultCases ✓
-   ✅ Transakcja zachowana
-   ✅ Rollback przy błędzie

**READ (find):**

-   ✅ Parametry identyczne (orConditions, parentType)
-   ✅ Filtrowanie identyczne

**UPDATE (edit):**

-   ✅ Parametr `fieldsToUpdate` obsługiwany
-   ✅ Logika częściowej aktualizacji zachowana
-   ✅ Transakcja zachowana

**DELETE:**

-   ✅ Parametry identyczne
-   ✅ Cascade delete zachowane (SQL CASCADE)

**Werdykt:** ✅ **100% funkcjonalności zachowanych**

---

### ✅ **5. Obsługa Transakcji**

**Zarządzanie transakcjami:**

-   ✅ Controller zarządza transakcjami (nie Repository)
-   ✅ Parametry `externalConn`, `isPartOfTransaction` przekazywane poprawnie
-   ✅ Rollback automatyczny przy błędzie
-   ✅ Kolejność operacji w transakcji zachowana

**Werdykt:** ✅ **Transakcje poprawnie zarządzane**

---

### ✅ **6. Backward Compatibility**

**Deprecated metody:**

1. ✅ `Model.editController()` - zachowana, oznaczona @deprecated
2. ✅ `Model.deleteController()` - zachowana, oznaczona @deprecated

**Użycie deprecated w kodzie:**

-   ✅ Router zrefaktoryzowany (używa Controller)
-   ⚠️ 2 użycia w starym kodzie (poza modułem) - do migracji w przyszłości

**Werdykt:** ✅ **Backward compatibility zachowana**

---

### 🎯 **PODSUMOWANIE**

| Kategoria                  | Status      | Szczegóły                         |
| -------------------------- | ----------- | --------------------------------- |
| **Mapowanie SQL → Model**  | ✅ **100%** | Wszystkie pola zachowane          |
| **Konstruktory**           | ✅ **100%** | Instancje klas, nie plain objects |
| **Zapytania SQL**          | ✅ **100%** | Identyczne SELECT/JOIN/WHERE      |
| **Funkcjonalność CRUD**    | ✅ **100%** | Logika bez zmian                  |
| **Transakcje DB**          | ✅ **100%** | Rollback i kolejność zachowana    |
| **Backward Compatibility** | ✅ **100%** | Deprecated działają               |

### ✅ **WERDYKT: REFAKTORYZACJA POPRAWNA - ZERO UTRATY FUNKCJONALNOŚCI**

**Nie utracono żadnego pola, żadnej funkcjonalności, żadnej logiki biznesowej.**
```

---

## 🚨 Red Flags - Błędy do Natychmiastowej Naprawy

Jeśli audyt wykryje poniższe problemy - **STOP** i napraw przed kontynuacją:

### **🔴 CRITICAL:**

1. ❌ **Brakuje pole SQL** → Dane będą niekompletne
2. ❌ **Repository zwraca `TData[]` zamiast `T[]`** → Utrata metod instancji
3. ❌ **Brakuje JOIN** → Powiązane dane nigdy nie będą załadowane
4. ❌ **Zmieniono LEFT JOIN na INNER** → Filtrowanie zmienione, mniej wyników
5. ❌ **Transakcja w Repository** → Naruszenie Clean Architecture
6. ❌ **Usunięto deprecated bez migracji** → Breaking change, kod przestanie działać

### **🟡 WARNING:**

1. ⚠️ **Zmieniono kolejność pól** → OK, ale sprawdź czy nie wpływa na testy
2. ⚠️ **Dodano nowe pole** → OK, jeśli zamierzone
3. ⚠️ **Zmieniono nazwę metody** → OK, jeśli deprecated przekierowuje

---

## 📚 Powiązane Dokumenty

-   [Podstawowe wytyczne](./clean-architecture.md) - Quick reference
-   [Szczegółowy przewodnik](./clean-architecture-details.md) - Implementacje + przykłady
-   [AI Assistant](./ai-decision-trees.md) - Drzewa decyzyjne
-   [Testowanie](./testing-per-layer.md) - Testy po refaktoryzacji
-   [OAuth Refactoring](./auth-migration.md) - Wzorzec OAuth

---

**Wersja:** 1.1
**Ostatnia aktualizacja:** 2025-12-15
**Przeznaczenie:** Quality Assurance po refaktoryzacji Clean Architecture
