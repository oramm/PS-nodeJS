---
applyTo: '**/*.ts'
description: 'Clean Architecture guidelines - PRIORITY: CRITICAL | ENFORCE: STRICT | Version: 2.0'
---

# Wytyczne Architektoniczne - Clean Architecture

> 📖 **Więcej:** [Testowanie](./testing-per-layer.md) | [Kontekst systemu](./system-context.md)
> Implementacje wzorcow czytaj z kodu: `src/controllers/BaseController.ts`, `src/repositories/BaseRepository.ts`.

## 🎯 Filozofia

**Separation of Concerns** - każda warstwa ma jedno, dobrze zdefiniowane zadanie.
System oparty na **Clean Architecture** z jednokierunkowym przepływem zależności.

## Polityka wzorca: target vs legacy

### Target pattern (reguly docelowe dla nowego kodu)

- Dotyczy calego nowego kodu i nowych endpointow.
- Dotyczy tez refaktoryzowanych fragmentow w istniejacych plikach.
- Wymagany przeplyw: `Router -> (Validator) -> Controller -> Repository -> Model`.
- Brak zgodnosci z target pattern blokuje merge.

### Legacy tolerated (tymczasowo dopuszczone w kodzie istniejacym)

- Dopuszczone tylko w kodzie juz istniejacym przed 2026-02-23 i tylko do czasu migracji.
- Przejsciowo tolerowane sa m.in.:
- Router tworzacy `new Model(...)` i przekazujacy obiekt do `Controller.add(...)`.
- Istniejace wywolania deprecated (`addNew`, `getList`, itp.), jezeli nie sa rozszerzane.
- Istniejace miejsca z historyczna struktura zaleznosci, o ile zmiana nie obejmuje tego obszaru.
- Legacy nie moze byc kopiowane do nowego kodu ani nowych endpointow.

### Migration policy (jak wygaszamy legacy)

- Zasada `touch-and-migrate`: gdy modyfikujesz endpoint lub warstwe, migrujesz ten fragment do target pattern w tym samym PR.
- Dla zmian wysokiego ryzyka, ktorych nie da sie domknac w jednym PR: wymagany jest wpis na backlogu z zakresem i ownerem.
- Priorytet migracji: `Router new Model` -> `Model importuje Controller/Repository` -> pozostale deprecated wywolania.
- Koniec tolerancji legacy nastapi po zamknieciu pozycji Critical/High w audycie architecture docs.

### Blockers for new code (bezwzglednie zabronione od teraz)

- Dodawanie `new Model(...)` w Router.
- Bezposrednie wywolanie Repository z Router.
- Dodawanie importow `Controller`/`Repository` w Model.
- Dodawanie operacji DB I/O w Model (`ToolsDb`, zapytania SQL).
- Dodawanie transakcji w Repository (`ToolsDb.transaction`).

## Target pattern - ZASADY OBOWIĄZKOWE (MUST)

AI: Te reguly sa **nie negocjowalne** dla nowego kodu i migrowanych fragmentow:

1. ❌ Model **NIE MOŻE** importować Controller ani Repository
2. ❌ Model **NIE MOŻE** wykonywać operacji I/O do **bazy danych**
3. ❌ Repository **NIE MOŻE** zawierać logiki biznesowej
4. ❌ Router **NIE MOŻE** tworzyć instancji Model ani wywoływać Repository
5. ❌ Validator **NIE MOŻE** być wewnątrz Router, Controller, Repository ani Model
6. ✅ Validator **MUSI BYĆ** osobną klasą (jeśli potrzebny)
7. ✅ Przepływ **MUSI BYĆ**: Router → (Validator) → Controller → Repository → Model
8. ✅ Controller **MUSI** zarządzać transakcjami (nie Repository)

## 📐 Przepływ Danych (OBOWIĄZKOWY)

**ASCII (quick reference):**

```
Router → Controller.addFromDto(dto) → Controller.add(model) → Repository → Model
                                              ↓
                                         ToolsGd/ToolsEmail
```

**Mermaid (pełny diagram):**

```mermaid
flowchart LR
    subgraph HTTP["HTTP Layer"]
        Router
    end
    subgraph App["Application Layer"]
        Validator
        Controller
    end
    subgraph Data["Data Layer"]
        Repository
    end
    subgraph Domain["Domain Layer"]
        Model
    end
    subgraph Tools["External Tools"]
        ToolsGd
        ToolsEmail
        ToolsDb
    end

    Router -->|"dto"| Controller
    Controller -.->|"optional"| Validator
    Controller -->|"model"| Repository
    Repository --> Model
    Repository --> ToolsDb
    Model -.->|"GD/Email only"| ToolsGd
    Model -.->|"GD/Email only"| ToolsEmail
    Controller -->|"orkiestruje"| Model
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
-   Wywołać **jedną** metodę Controllera (np. `Controller.addFromDto(dto)`)
-   Zwrócić odpowiedź HTTP (`res.send()`, `next(error)`)

❌ **NIE powinien:**

-   Zawierać logiki biznesowej
-   Tworzyć instancji Model (`new Item()`) - to robi Controller
-   Wywoływać Repository bezpośrednio
-   Wywoływać Validator bezpośrednio (deleguj do Controller)

**Wzorzec docelowy:**

```typescript
// ✅ DOBRZE - Router przekazuje DTO do Controller
router.post('/items', async (req, res, next) => {
    try {
        const result = await ItemsController.addFromDto(req.parsedBody);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

// ❌ LEGACY - Router tworzy Model (tolerowane w istniejącym kodzie)
router.post('/items', async (req, res, next) => {
    const item = new Item(req.parsedBody); // ❌ Nie kopiuj tego wzorca
    await ItemsController.add(item);
    res.send(item);
});
```

---

### **Validator (Validation Layer)**

**Rola:** Osobna klasa do walidacji danych wejściowych (HTTP/DTO).

**Kiedy Validator jest OBOWIĄZKOWY:**

-   Encja z **polimorfizmem** (różne podklasy, np. Letter → OurLetter/IncomingLetter)
-   Encja ze **złożonym DTO** (>10 pól, zależności między polami)
-   Wymagana **walidacja kontekstowa** (sprawdzenie stanu innych obiektów)

**Przykłady encji wymagających Validatora:** `Letters`, `Offers`, `Invoices`

✅ **Powinien:**

-   Być **osobną klasą** (np. `LetterValidator`, `InvoiceValidator`)
-   Walidować atrybuty wymagane do określenia typu obiektu
-   Dostarczać szczegółowe komunikaty błędów (diagnostyka)
-   Być **stateless** (tylko statyczne metody)
-   **Rzucać błędem** przy nieprawidłowych danych (fail-fast)
-   Używać **TypeResolver** dla logiki wyboru typu (patrz: Polimorfizm)

❌ **NIE powinien:**

-   Być **wewnątrz** Router, Controller, Repository ani Model
-   Zawierać logiki biznesowej (→ Model)
-   Wykonywać operacji I/O (baza danych, API)
-   **Naprawiać/transformować** niepełnych danych
-   Duplikować logiki wyboru typu (używaj TypeResolver)

**Lokalizacja:** Obok Model w warstwie domenowej (np. `src/letters/LetterValidator.ts`)

**Wywołanie:** Tylko przez **Controller** (w metodzie `addFromDto`/`editFromDto`)

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
-   Zawierać **invarianty domenowe** (np. `validate(): boolean`)
-   Zawierać logikę biznesową (kalkulacje, generowanie numerów)
-   Otrzymywać dane przez parametry metod

**Walidacja w Model vs Validator:**

-   **Model.validate()** - invarianty wewnętrzne obiektu (np. "data końca ≥ data początku")
-   **Validator** - walidacja danych wejściowych HTTP/DTO (np. "czy przesłano wymagane pola")

❌ **NIE powinien:**

-   Importować Controller ani Repository
-   Wykonywać operacji I/O do **bazy danych**
-   Zawierać logiki HTTP
-   Pobierać OAuth token (musi otrzymać `auth` w parametrze)

**Wyjątek I/O - GD/Email:**

Model **MOŻE** mieć operacje na Google Drive / Email, jeśli:

1. ✅ Controller **orkiestruje** wywołanie (decyduje KIEDY)
2. ✅ Model otrzymuje `auth: OAuth2Client` jako **parametr** (nie pobiera sam)
3. ✅ Model importuje tylko `ToolsGd`/`ToolsEmail` (nie Controllery!)

Przyklad: `OurLetter.exportToPDF(auth)` - operacja na Google Drive, wywolywana przez Controller.

## 🔧 Wzorce Implementacyjne

### Validator Pattern

**Kiedy używać:** Encje z polimorfizmem, złożonym DTO lub walidacją kontekstową.

```typescript
export default class EntityValidator {
    // Walidacja typu/struktury danych wejściowych
    static validateEntityTypeData(dto: EntityDto): ValidationResult {
        const result = { isValid: false, errors: [], expectedType: null };

        // Użyj TypeResolver dla logiki wyboru typu
        const typeFlags = this.extractTypeFlags(dto);
        const resolvedType = EntityTypeResolver.resolve(typeFlags);

        if (!resolvedType) {
            result.errors.push('Cannot determine entity type');
            return result;
        }

        result.isValid = true;
        result.expectedType = resolvedType;
        return result;
    }

    // Formatowanie błędów (diagnostyka)
    static formatValidationError(
        dto: any,
        validation: ValidationResult
    ): string {
        return `Validation failed: ${validation.errors.join(', ')}`;
    }
}
```

### TypeResolver Pattern (dla polimorfizmu)

**Cel:** Współdzielona logika wyboru typu między Validator i Repository.

```typescript
// src/letters/LetterTypeResolver.ts
export type LetterTypeFlags = {
    isOur: boolean;
    hasProject: boolean;
    hasOffer: boolean;
    idEqualsNumber: boolean;
};

export default class LetterTypeResolver {
    static resolve(flags: LetterTypeFlags): string | null {
        // Ta sama logika dla HTTP (Validator) i DB (Repository)
        if (flags.isOur && flags.idEqualsNumber && flags.hasProject)
            return 'OurLetterContract';
        if (flags.isOur && !flags.idEqualsNumber) return 'OurOldTypeLetter';
        if (flags.isOur && flags.hasOffer) return 'OurLetterOffer';
        if (!flags.isOur && flags.hasProject) return 'IncomingLetterContract';
        if (!flags.isOur && flags.hasOffer) return 'IncomingLetterOffer';
        return null;
    }
}
```

**Przykłady encji z Validatorem:** `Letters`, `Offers`, `Invoices`

---

## 📋 Standard Nazewnictwa CRUD

**Obowiązujący standard** dla metod Controller:

```typescript
// ✅ CRUD Methods Standard (docelowy)
static async find(params)           // READ - wyszukiwanie z warunkami
static async addFromDto(dto, auth?) // CREATE z DTO - Router wywołuje tę metodę
static async add(item, auth?)       // CREATE z Model - wewnętrzne/testy
static async editFromDto(dto, auth?)// UPDATE z DTO - Router wywołuje tę metodę
static async edit(item, auth?)      // UPDATE z Model - wewnętrzne/testy
static async delete(item, auth?)    // DELETE - usuwanie rekordu
```

**Wzorzec addFromDto:**

```typescript
static async addFromDto(dto: ItemDto, auth?: OAuth2Client): Promise<Item> {
    // 1. Walidacja (jeśli potrzebna)
    ItemValidator.validateItemTypeData(dto);

    // 2. Tworzenie instancji Model
    const item = new Item(dto);

    // 3. Delegacja do kanonicznej metody
    return await this.add(item, auth);
}
```

**Deprecated patterns** (do usunięcia w starym kodzie):

-   ❌ `addNew()` → użyj `addFromDto()` lub `add()`
-   ❌ `getList()`, `getMilestoneTypesList()` → użyj `find()`
-   ❌ `new Model(req.body)` w Router → użyj `Controller.addFromDto(dto)`

---

## 🔧 Wzorce Implementacyjne

### BaseRepository<T>

**Wzorzec:** Baza dla wszystkich Repository z metodami CRUD i budowaniem warunków SQL.

```typescript
abstract class BaseRepository<T> {
    async addInDb(item: T, conn?, isTransaction?): Promise<void>;
    async editInDb(item: T, conn?, isTransaction?, fields?): Promise<void>;
    async deleteFromDb(item: T): Promise<void>;
    abstract mapRowToModel(row: any): T;
    abstract find(conditions?): Promise<T[]>;
}
```

**Wzorzec budowania warunków SQL (`makeAndConditions`):**

```typescript
// ✅ POPRAWNIE - array + join pattern
private makeAndConditions(searchParams: SearchParams): string {
    const whereClauses: string[] = [];

    if (searchParams.projectId)
        whereClauses.push(`Projects.OurId = '${searchParams.projectId}'`);
    if (searchParams.contractId)
        whereClauses.push(`Contracts.Id = ${searchParams.contractId}`);
    if (searchParams.ids?.length)
        whereClauses.push(`Items.Id IN (${searchParams.ids.join(',')})`);

    return whereClauses.length > 0 ? whereClauses.join(' AND ') : '1';
}

// ❌ ŹLE - inline warunki w find()
async find(params) {
    let sql = 'SELECT ... WHERE 1';
    if (params.id) sql += ` AND Id = ${params.id}`;  // NIE RÓB TAK!
}
```

### BaseController<T, R>

**Wzorzec:** Singleton z prywatnymi metodami instancyjnymi.

> ⚠️ **DEPRECATED:** Metody `instance.create()`, `instance.edit()`, `instance.delete()` są **@deprecated**.
> W nowym kodzie używaj bezpośrednio `instance.repository.addInDb()`, `instance.repository.editInDb()`, `instance.repository.deleteFromDb()`.

```typescript
abstract class BaseController<T, R extends BaseRepository<T>> {
    protected repository: R;

    // PRYWATNY Singleton - NIE eksponuj getInstance()!
    private static instance: MyController;
    private static getInstance(): MyController { ... }

    // @deprecated - używaj instance.repository.*InDb() zamiast tych metod
    protected async create(item, conn?, isTransaction?): Promise<void>;
    protected async edit(item, conn?, isTransaction?, fields?): Promise<void>;
    protected async delete(item, conn?, isTransaction?): Promise<void>;
}
```

**ZASADA: Każdy Controller MUSI eksponować statyczne metody CRUD:**

```typescript
// ✅ PROSTY PRZYPADEK (asocjacje, proste modele):
static async add(item: T, conn?, isTransaction?): Promise<T> {
    const instance = this.getInstance();
    await instance.repository.addInDb(item, conn, isTransaction);
    return item;
}

// ✅ ZŁOŻONY PRZYPADEK (z Google Drive, walidacją):
static async add(item: T, auth?: OAuth2Client): Promise<T> {
    return await this.withAuth(async (instance, authClient) => {
        await item.createFolder(authClient);
        await instance.repository.addInDb(item);
        return item;
    }, auth);
}
```

**UŻYCIE:**

```typescript
// ✅ POPRAWNIE - statyczne wywołanie:
await MyController.add(item, conn, true);

// ❌ BŁĘDNIE - NIE eksponuj getInstance():
await MyController.getInstance().create(item); // NIE RÓB TAK!
```

### Autoryzacja Google API

**Nowy kod:** `BaseController.withAuth()` - Controller dostaje `OAuth2Client` i orkiestruje operacje GD/Docs/Gmail.

```typescript
static async add(item: T, auth?: OAuth2Client): Promise<T> {
    return await this.withAuth(async (instance, authClient) => {
        await item.createFolder(authClient);
        await instance.repository.addInDb(item);
        return item;
    }, auth);
}
```

**Legacy: `ToolsGapi.gapiReguestHandler()`** - tolerowane w routerach, ktore juz go uzywaja
(`grep -rl gapiReguestHandler src`); nie dodawaj go do nowych endpointow. Zasady dla istniejacych wywolan:

```typescript
// ✅ POPRAWNIE - funkcja async z OAuth2Client jako pierwszy parametr
await ToolsGapi.gapiReguestHandler(req, res, async (auth: OAuth2Client) => {
    await model.someGoogleApiMethod(auth);
});

// ✅ POPRAWNIE - z dodatkowymi argumentami
await ToolsGapi.gapiReguestHandler(
    req,
    res,
    model.exportToPDF,
    [documentId, options],
    model
);

// ❌ ŹLE - funkcja bez 'async'
await ToolsGapi.gapiReguestHandler(req, res, (auth: OAuth2Client) => {
    // ❌ Brak async
    model.someMethod(auth);
});
```

**Zasady:**

-   Funkcja **MUSI** przyjmować `OAuth2Client` jako pierwszy parametr
-   Funkcja **MUSI** być `async` lub zwracać `Promise`
-   Używaj tylko w **Router** (nie w Controller/Repository/Model)

## 📋 Zasady Refaktoringu

1. **Oznacz @deprecated** - nie usuwaj od razu
2. **Stwórz nową implementację** w odpowiedniej warstwie
3. **Migruj stopniowo** - Router → inne komponenty
4. **Usuń deprecated** po weryfikacji (grep/search)

> ⚠️ **Po przeniesieniu mapowania DB → Model** porownaj liste pol `row.` przed i po
> (`git show <base>:<plik> | grep 'row\.' | sort` vs to samo na nowej wersji).
> Ciche zgubienie pola albo JOIN-a to najczestszy blad tej refaktoryzacji - traktuj jako blocker.

## ✅ Checklist Przed Commitem

-   [ ] Przepływ: Router → (Validator) → Controller → Repository → Model
-   [ ] Model NIE importuje Controller/Repository
-   [ ] Repository NIE zawiera logiki biznesowej
-   [ ] Controller zarządza transakcjami
-   [ ] Validator jest **osobną klasą** (jeśli istnieje)
-   [ ] Validator NIE jest wewnątrz innych warstw
-   [ ] Brak cykli zależności (sprawdź: `madge`)
