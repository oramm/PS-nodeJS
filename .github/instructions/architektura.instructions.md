<!-- canonical: documentation/team/architecture/clean-architecture.md -->
<!-- sync: przy edycji ZAWSZE edytuj canonical, potem skopiuj tutaj -->

---
applyTo: '**/*.ts'
description: 'Clean Architecture guidelines - PRIORITY: CRITICAL | ENFORCE: STRICT | Version: 2.0'
---

# Wytyczne Architektoniczne - Clean Architecture

> đź“– **WiÄ™cej:** [SzczegĂłĹ‚owy przewodnik](../../documentation/team/architecture/clean-architecture-details.md) | [AI Assistant](../../documentation/team/architecture/ai-decision-trees.md) | [Testowanie](../../documentation/team/architecture/testing-per-layer.md) | [Audyt Refaktoryzacji](../../documentation/team/architecture/refactoring-audit.md)

## đźŽŻ Filozofia

**Separation of Concerns** - kaĹĽda warstwa ma jedno, dobrze zdefiniowane zadanie.
System oparty na **Clean Architecture** z jednokierunkowym przepĹ‚ywem zaleĹĽnoĹ›ci.

## đźš¨ ZASADY OBOWIÄ„ZKOWE (MUST)

AI: Te reguĹ‚y sÄ… **nie negocjowalne** - zawsze enforce przy generowaniu/review kodu:

1. âťŚ Model **NIE MOĹ»E** importowaÄ‡ Controller ani Repository
2. âťŚ Model **NIE MOĹ»E** wykonywaÄ‡ operacji I/O do **bazy danych**
3. âťŚ Repository **NIE MOĹ»E** zawieraÄ‡ logiki biznesowej
4. âťŚ Router **NIE MOĹ»E** tworzyÄ‡ instancji Model ani wywoĹ‚ywaÄ‡ Repository
5. âťŚ Validator **NIE MOĹ»E** byÄ‡ wewnÄ…trz Router, Controller, Repository ani Model
6. âś… Validator **MUSI BYÄ†** osobnÄ… klasÄ… (jeĹ›li potrzebny)
7. âś… PrzepĹ‚yw **MUSI BYÄ†**: Router â†’ (Validator) â†’ Controller â†’ Repository â†’ Model
8. âś… Controller **MUSI** zarzÄ…dzaÄ‡ transakcjami (nie Repository)

## đź“ PrzepĹ‚yw Danych (OBOWIÄ„ZKOWY)

**ASCII (quick reference):**

```
Router â†’ Controller.addFromDto(dto) â†’ Controller.add(model) â†’ Repository â†’ Model
                                              â†“
                                         ToolsGd/ToolsEmail
```

**Mermaid (peĹ‚ny diagram):**

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

**Zasada:** Ĺ»adna warstwa NIE moĹĽe komunikowaÄ‡ siÄ™ z warstwÄ… "wyĹĽej".

**Validator:** Osobna, opcjonalna klasa do walidacji/transformacji danych.

-   WywoĹ‚ywana przez Router (transformacja danych HTTP) lub Controller (przed utworzeniem Model)
-   **NIE** jest warstwÄ… - jest narzÄ™dziem uĹĽywanym przez Router/Controller
-   **MUSI** byÄ‡ osobnÄ… klasÄ… (nie moĹĽe byÄ‡ wewnÄ…trz innych warstw)

## đźŹ›ď¸Ź Warstwy Architektoniczne

### **Router (HTTP Layer)**

**Rola:** NajcieĹ„sza warstwa - tĹ‚umaczy HTTP na wywoĹ‚ania aplikacji.

âś… **Powinien:**

-   DefiniowaÄ‡ endpointy (`app.post('/items', ...)`)
-   WywoĹ‚aÄ‡ **jednÄ…** metodÄ™ Controllera (np. `Controller.addFromDto(dto)`)
-   ZwrĂłciÄ‡ odpowiedĹş HTTP (`res.send()`, `next(error)`)

âťŚ **NIE powinien:**

-   ZawieraÄ‡ logiki biznesowej
-   TworzyÄ‡ instancji Model (`new Item()`) - to robi Controller
-   WywoĹ‚ywaÄ‡ Repository bezpoĹ›rednio
-   WywoĹ‚ywaÄ‡ Validator bezpoĹ›rednio (deleguj do Controller)

**Wzorzec docelowy:**

```typescript
// âś… DOBRZE - Router przekazuje DTO do Controller
router.post('/items', async (req, res, next) => {
    try {
        const result = await ItemsController.addFromDto(req.parsedBody);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

// âťŚ LEGACY - Router tworzy Model (tolerowane w istniejÄ…cym kodzie)
router.post('/items', async (req, res, next) => {
    const item = new Item(req.parsedBody); // âťŚ Nie kopiuj tego wzorca
    await ItemsController.add(item);
    res.send(item);
});
```

---

### **Validator (Validation Layer)**

**Rola:** Osobna klasa do walidacji danych wejĹ›ciowych (HTTP/DTO).

**Kiedy Validator jest OBOWIÄ„ZKOWY:**

-   Encja z **polimorfizmem** (rĂłĹĽne podklasy, np. Letter â†’ OurLetter/IncomingLetter)
-   Encja ze **zĹ‚oĹĽonym DTO** (>10 pĂłl, zaleĹĽnoĹ›ci miÄ™dzy polami)
-   Wymagana **walidacja kontekstowa** (sprawdzenie stanu innych obiektĂłw)

**PrzykĹ‚ady encji wymagajÄ…cych Validatora:** `Letters`, `Offers`, `Invoices`

âś… **Powinien:**

-   ByÄ‡ **osobnÄ… klasÄ…** (np. `LetterValidator`, `InvoiceValidator`)
-   WalidowaÄ‡ atrybuty wymagane do okreĹ›lenia typu obiektu
-   DostarczaÄ‡ szczegĂłĹ‚owe komunikaty bĹ‚Ä™dĂłw (diagnostyka)
-   ByÄ‡ **stateless** (tylko statyczne metody)
-   **RzucaÄ‡ bĹ‚Ä™dem** przy nieprawidĹ‚owych danych (fail-fast)
-   UĹĽywaÄ‡ **TypeResolver** dla logiki wyboru typu (patrz: Polimorfizm)

âťŚ **NIE powinien:**

-   ByÄ‡ **wewnÄ…trz** Router, Controller, Repository ani Model
-   ZawieraÄ‡ logiki biznesowej (â†’ Model)
-   WykonywaÄ‡ operacji I/O (baza danych, API)
-   **NaprawiaÄ‡/transformowaÄ‡** niepeĹ‚nych danych
-   DuplikowaÄ‡ logiki wyboru typu (uĹĽywaj TypeResolver)

**Lokalizacja:** Obok Model w warstwie domenowej (np. `src/letters/LetterValidator.ts`)

**WywoĹ‚anie:** Tylko przez **Controller** (w metodzie `addFromDto`/`editFromDto`)

**Filozofia:** Validator **wymusza kompletnoĹ›Ä‡ danych** - jeĹ›li klient przesĹ‚aĹ‚ niepeĹ‚ne dane, to bĹ‚Ä…d, nie workaround.

**PrzykĹ‚ad:**

```typescript
// âś… DOBRZE - Validator jako osobna klasa
export default class LetterValidator {
    // Walidacja typu na podstawie danych z klienta
    // WAĹ»NE: Ta sama kolejnoĹ›Ä‡ warunkĂłw co w LetterRepository.getLetterType()
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
        // Brak dopasowania - rzuÄ‡ szczegĂłĹ‚owy bĹ‚Ä…d
        return { isValid: false, errors: ['Missing _project.id or _offer.id'] };
    }

    // Walidacja spĂłjnoĹ›ci danych biznesowych
    static validateLetterData(letter: Letter): string[] { ... }
}

// Controller
const validation = LetterValidator.validateLetterTypeData(initParam);
if (!validation.isValid) {
    throw new Error(`Invalid letter data: ${validation.errors.join(', ')}`);
}
const letter = LettersController.createProperLetter(initParam);

// âťŚ ĹąLE - walidacja wewnÄ…trz Model/Controller
class Letter {
    validate() { ... } // NIE - to Ĺ‚amie Single Responsibility
}
```

---

### **Controller (Application Layer)**

**Rola:** Orkiestruje operacje - koordynuje Repository i Model.

âś… **Powinien:**

-   ImplementowaÄ‡ use case (np. "dodaj nowe miasto")
-   ZarzÄ…dzaÄ‡ transakcjami bazodanowymi
-   WywoĹ‚ywaÄ‡ Repository do operacji CRUD
-   WywoĹ‚ywaÄ‡ metody biznesowe na Model
-   TworzyÄ‡ instancje Model
-   WywoĹ‚aÄ‡ Validator przed utworzeniem instancji Model (jeĹ›li Validator istnieje)

âťŚ **NIE powinien:**

-   PisaÄ‡ zapytaĹ„ SQL
-   OperowaÄ‡ na `request`/`response`
-   ZawieraÄ‡ logiki biznesowej (â†’ Model)
-   ZawieraÄ‡ walidacji (â†’ Validator)

**Wzorzec:** Dziedziczy po `BaseController<T, R>` (Singleton + DI)

---

### **Repository (Data Access Layer)**

**Rola:** Jedyny punkt kontaktu z bazÄ… danych.

âś… **Powinien:**

-   ImplementowaÄ‡ CRUD (Create, Read, Update, Delete)
-   BudowaÄ‡ i wykonywaÄ‡ zapytania SQL
-   MapowaÄ‡ dane DB â†’ Model (`mapRowToModel()`)
-   ObsĹ‚ugiwaÄ‡ polimorfizm zapisu/odczytu

âťŚ **NIE powinien:**

-   ZawieraÄ‡ logiki biznesowej
-   WiedzieÄ‡ o Controller czy Router
-   KoordynowaÄ‡ innych Repository

**Wzorzec:** Dziedziczy po `BaseRepository<T>` (unikanie duplikacji CRUD)

---

### **Model (Domain Layer)**

**Rola:** Serce aplikacji - obiekty biznesowe i ich zachowanie.

âś… **Powinien:**

-   DefiniowaÄ‡ wĹ‚aĹ›ciwoĹ›ci obiektu
-   ZawieraÄ‡ **invarianty domenowe** (np. `validate(): boolean`)
-   ZawieraÄ‡ logikÄ™ biznesowÄ… (kalkulacje, generowanie numerĂłw)
-   OtrzymywaÄ‡ dane przez parametry metod

**Walidacja w Model vs Validator:**

-   **Model.validate()** - invarianty wewnÄ™trzne obiektu (np. "data koĹ„ca â‰Ą data poczÄ…tku")
-   **Validator** - walidacja danych wejĹ›ciowych HTTP/DTO (np. "czy przesĹ‚ano wymagane pola")

âťŚ **NIE powinien:**

-   ImportowaÄ‡ Controller ani Repository
-   WykonywaÄ‡ operacji I/O do **bazy danych**
-   ZawieraÄ‡ logiki HTTP
-   PobieraÄ‡ OAuth token (musi otrzymaÄ‡ `auth` w parametrze)

**WyjÄ…tek I/O - GD/Email:**

Model **MOĹ»E** mieÄ‡ operacje na Google Drive / Email, jeĹ›li:

1. âś… Controller **orkiestruje** wywoĹ‚anie (decyduje KIEDY)
2. âś… Model otrzymuje `auth: OAuth2Client` jako **parametr** (nie pobiera sam)
3. âś… Model importuje tylko `ToolsGd`/`ToolsEmail` (nie Controllery!)

Zobacz [szczegĂłĹ‚y](../../documentation/team/architecture/clean-architecture-details.md#model-io).

## đź”§ Wzorce Implementacyjne

### Validator Pattern

**Kiedy uĹĽywaÄ‡:** Encje z polimorfizmem, zĹ‚oĹĽonym DTO lub walidacjÄ… kontekstowÄ….

```typescript
export default class EntityValidator {
    // Walidacja typu/struktury danych wejĹ›ciowych
    static validateEntityTypeData(dto: EntityDto): ValidationResult {
        const result = { isValid: false, errors: [], expectedType: null };

        // UĹĽyj TypeResolver dla logiki wyboru typu
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

    // Formatowanie bĹ‚Ä™dĂłw (diagnostyka)
    static formatValidationError(
        dto: any,
        validation: ValidationResult
    ): string {
        return `Validation failed: ${validation.errors.join(', ')}`;
    }
}
```

### TypeResolver Pattern (dla polimorfizmu)

**Cel:** WspĂłĹ‚dzielona logika wyboru typu miÄ™dzy Validator i Repository.

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

**PrzykĹ‚ady encji z Validatorem:** `Letters`, `Offers`, `Invoices`

---

## đź“‹ Standard Nazewnictwa CRUD

**ObowiÄ…zujÄ…cy standard** dla metod Controller:

```typescript
// âś… CRUD Methods Standard (docelowy)
static async find(params)           // READ - wyszukiwanie z warunkami
static async addFromDto(dto, auth?) // CREATE z DTO - Router wywoĹ‚uje tÄ™ metodÄ™
static async add(item, auth?)       // CREATE z Model - wewnÄ™trzne/testy
static async editFromDto(dto, auth?)// UPDATE z DTO - Router wywoĹ‚uje tÄ™ metodÄ™
static async edit(item, auth?)      // UPDATE z Model - wewnÄ™trzne/testy
static async delete(item, auth?)    // DELETE - usuwanie rekordu
```

**Wzorzec addFromDto:**

```typescript
static async addFromDto(dto: ItemDto, auth?: OAuth2Client): Promise<Item> {
    // 1. Walidacja (jeĹ›li potrzebna)
    ItemValidator.validateItemTypeData(dto);

    // 2. Tworzenie instancji Model
    const item = new Item(dto);

    // 3. Delegacja do kanonicznej metody
    return await this.add(item, auth);
}
```

**Deprecated patterns** (do usuniÄ™cia w starym kodzie):

-   âťŚ `addNew()` â†’ uĹĽyj `addFromDto()` lub `add()`
-   âťŚ `getList()`, `getMilestoneTypesList()` â†’ uĹĽyj `find()`
-   âťŚ `new Model(req.body)` w Router â†’ uĹĽyj `Controller.addFromDto(dto)`

---

## đź”§ Wzorce Implementacyjne

### BaseRepository<T>

**Wzorzec:** Baza dla wszystkich Repository z metodami CRUD i budowaniem warunkĂłw SQL.

```typescript
abstract class BaseRepository<T> {
    async addInDb(item: T, conn?, isTransaction?): Promise<void>;
    async editInDb(item: T, conn?, isTransaction?, fields?): Promise<void>;
    async deleteFromDb(item: T): Promise<void>;
    abstract mapRowToModel(row: any): T;
    abstract find(conditions?): Promise<T[]>;
}
```

**Wzorzec budowania warunkĂłw SQL (`makeAndConditions`):**

```typescript
// âś… POPRAWNIE - array + join pattern
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

// âťŚ ĹąLE - inline warunki w find()
async find(params) {
    let sql = 'SELECT ... WHERE 1';
    if (params.id) sql += ` AND Id = ${params.id}`;  // NIE RĂ“B TAK!
}
```

### BaseController<T, R>

**Wzorzec:** Singleton z prywatnymi metodami instancyjnymi.

> âš ď¸Ź **DEPRECATED:** Metody `instance.create()`, `instance.edit()`, `instance.delete()` sÄ… **@deprecated**.
> W nowym kodzie uĹĽywaj bezpoĹ›rednio `instance.repository.addInDb()`, `instance.repository.editInDb()`, `instance.repository.deleteFromDb()`.
> SzczegĂłĹ‚y: [refactoring-auth-pattern.md](../../documentation/team/architecture/auth-migration.md)

```typescript
abstract class BaseController<T, R extends BaseRepository<T>> {
    protected repository: R;

    // PRYWATNY Singleton - NIE eksponuj getInstance()!
    private static instance: MyController;
    private static getInstance(): MyController { ... }

    // @deprecated - uĹĽywaj instance.repository.*InDb() zamiast tych metod
    protected async create(item, conn?, isTransaction?): Promise<void>;
    protected async edit(item, conn?, isTransaction?, fields?): Promise<void>;
    protected async delete(item, conn?, isTransaction?): Promise<void>;
}
```

**ZASADA: KaĹĽdy Controller MUSI eksponowaÄ‡ statyczne metody CRUD:**

```typescript
// âś… PROSTY PRZYPADEK (asocjacje, proste modele):
static async add(item: T, conn?, isTransaction?): Promise<T> {
    const instance = this.getInstance();
    await instance.repository.addInDb(item, conn, isTransaction);
    return item;
}

// âś… ZĹOĹ»ONY PRZYPADEK (z Google Drive, walidacjÄ…):
static async add(item: T, auth?: OAuth2Client): Promise<T> {
    return await this.withAuth(async (instance, authClient) => {
        await item.createFolder(authClient);
        await instance.repository.addInDb(item);
        return item;
    }, auth);
}
```

**UĹ»YCIE:**

```typescript
// âś… POPRAWNIE - statyczne wywoĹ‚anie:
await MyController.add(item, conn, true);

// âťŚ BĹÄDNIE - NIE eksponuj getInstance():
await MyController.getInstance().create(item); // NIE RĂ“B TAK!
```

### ToolsGapi.gapiReguestHandler()

**Kiedy uĹĽywaÄ‡:** Do operacji wymagajÄ…cych autoryzacji Google API (Drive, Docs, Gmail).

```typescript
// âś… POPRAWNIE - funkcja async z OAuth2Client jako pierwszy parametr
await ToolsGapi.gapiReguestHandler(req, res, async (auth: OAuth2Client) => {
    await model.someGoogleApiMethod(auth);
});

// âś… POPRAWNIE - z dodatkowymi argumentami
await ToolsGapi.gapiReguestHandler(
    req,
    res,
    model.exportToPDF,
    [documentId, options],
    model
);

// âťŚ ĹąLE - funkcja bez 'async'
await ToolsGapi.gapiReguestHandler(req, res, (auth: OAuth2Client) => {
    // âťŚ Brak async
    model.someMethod(auth);
});
```

**Zasady:**

-   Funkcja **MUSI** przyjmowaÄ‡ `OAuth2Client` jako pierwszy parametr
-   Funkcja **MUSI** byÄ‡ `async` lub zwracaÄ‡ `Promise`
-   UĹĽywaj tylko w **Router** (nie w Controller/Repository/Model)

## đź“‹ Zasady Refaktoringu

1. **Oznacz @deprecated** - nie usuwaj od razu
2. **StwĂłrz nowÄ… implementacjÄ™** w odpowiedniej warstwie
3. **Migruj stopniowo** - Router â†’ inne komponenty
4. **PrzeprowadĹş audyt** - [szczegĂłĹ‚owa checklist](../../documentation/team/architecture/refactoring-audit.md)
5. **UsuĹ„ deprecated** po weryfikacji (grep/search)

> đź“‹ **Audyt Refaktoryzacji:** Po kaĹĽdej refaktoryzacji CRUD/Repository/Model uĹĽyj [przewodnika audytu](../../documentation/team/architecture/refactoring-audit.md) aby zweryfikowaÄ‡, ĹĽe nie utracono funkcjonalnoĹ›ci.

## âś… Checklist Przed Commitem

-   [ ] PrzepĹ‚yw: Router â†’ (Validator) â†’ Controller â†’ Repository â†’ Model
-   [ ] Model NIE importuje Controller/Repository
-   [ ] Repository NIE zawiera logiki biznesowej
-   [ ] Controller zarzÄ…dza transakcjami
-   [ ] Validator jest **osobnÄ… klasÄ…** (jeĹ›li istnieje)
-   [ ] Validator NIE jest wewnÄ…trz innych warstw
-   [ ] Brak cykli zaleĹĽnoĹ›ci (sprawdĹş: `madge`)

---

đź“š **WiÄ™cej:** [SzczegĂłĹ‚owy przewodnik z przykĹ‚adami](../../documentation/team/architecture/clean-architecture-details.md)

