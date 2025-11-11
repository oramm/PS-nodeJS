---
applyTo: '**/*.ts'
description: 'AI Assistant Guidelines - Decision Trees, Pattern Recognition, Error Detection | Version: 1.0'
---

# Wytyczne dla AI Assistant - Clean Architecture

> 🤖 **Plik specjalnie dla modeli AI** (GPT-4, Claude, Copilot)
>
> 📚 **Pełne wytyczne:** [Podstawy](./architektura.instructions.md) | [Szczegóły](./architektura-szczegoly.md) | [Testowanie](./architektura-testowanie.md)
>
> 📚 **Pełne wytyczne:** [Podstawy](./architektura.instructions.md) | [Szczegóły](./architektura-szczegoly.md)

---

## 🌳 DRZEWO DECYZYJNE: "Gdzie umieścić ten kod?"

### ❓ Mam metodę do zaimplementowania - gdzie ją umieścić?

```
START: Nowa metoda/logika do implementacji
│
├─ ❓ Czy wykonuje zapytania SQL (SELECT, INSERT, UPDATE, DELETE)?
│  └─ ✅ TAK → **REPOSITORY**
│     └─ Przykład: `async find(params)`, `async addInDb(item, conn)`
│
├─ ❓ Czy orkiestruje wiele operacji (transakcje, wywołania repo/model)?
│  └─ ✅ TAK → **CONTROLLER**
│     └─ Przykład: `static async add(item)` z transakcją
│
├─ ❓ Czy jest logiką biznesową obiektu (walidacja, kalkulacje, generowanie)?
│  └─ ✅ TAK → **MODEL**
│     └─ Przykład: `generateNumber(existing)`, `validate()`
│     └─ ⚠️ WYJĄTEK: Operacje GD/Email (jeśli Controller orkiestruje)
│
├─ ❓ Czy przetwarza HTTP (req, res, next, status codes)?
│  └─ ✅ TAK → **ROUTER**
│     └─ Przykład: `app.post('/items', async (req, res) => ...)`
│
└─ ❓ Nie pasuje do żadnej kategorii?
   └─ → **CONTROLLER** (domyślnie - punkt orkiestracji)
```

---

## 🔍 PATTERN RECOGNITION: Rozpoznawanie warstw po sygnaturze

### **Router** - HTTP Layer

```typescript
// ✅ WZORZEC SYGNATURY:
async (req: Request, res: Response, next?: NextFunction) => {
    // 1. Wywołaj JEDNĄ metodę Controller
    // 2. Zwróć odpowiedź HTTP
};

// ✅ PRZYKŁAD:
router.post('/letters', async (req, res, next) => {
    try {
        const letter = LettersController.createProperLetter(req.body);
        await LettersController.add(letter);
        res.send(letter);
    } catch (error) {
        next(error);
    }
});

// ❌ ANTI-PATTERN - Router z logiką:
router.post('/letters', async (req, res) => {
    const letter = new Letter(req.body); // ❌ Tworzenie instancji
    letter.number = letter.id; // ❌ Logika biznesowa
    await letter.addInDb(); // ❌ Bezpośrednie wywołanie Model
    res.send(letter);
});
```

### **Controller** - Application/Service Layer

```typescript
// ✅ WZORZEC SYGNATURY:
static async methodName(
    domainObject: T,
    primitives?: string | number,
    auth?: OAuth2Client
): Promise<T | void>

// ✅ PRZYKŁAD:
class LettersController extends BaseController<Letter, LetterRepository> {
    static async add(letter: Letter): Promise<Letter> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            // Orkiestracja: Repository + asocjacje
            await instance.repository.addInDb(letter, conn, true);
            await this.addEntitiesAssociations(letter, conn);
            return letter;
        });
    }
}

// ❌ ANTI-PATTERN - Controller z SQL:
class LettersController {
    static async add(letter: Letter) {
        const sql = `INSERT INTO Letters ...`;  // ❌ SQL → Repository
        await db.query(sql);
    }
}
```

### **Repository** - Data Access Layer

```typescript
// ✅ WZORZEC SYGNATURY:
async methodName(
    item: T,
    externalConn?: mysql.PoolConnection,
    isPartOfTransaction?: boolean,
    additionalParams?: any
): Promise<T | T[] | void>

// ✅ PRZYKŁAD:
class LetterRepository extends BaseRepository<Letter> {
    async addInDb(
        item: Letter,
        externalConn?: mysql.PoolConnection,
        isPartOfTransaction?: boolean
    ): Promise<void> {
        if (isPartOfTransaction && externalConn) {
            return await ToolsDb.addInDb(this.tableName, item, externalConn);
        }
        return await ToolsDb.addInDb(this.tableName, item);
    }

    async find(params: LetterSearchParams): Promise<Letter[]> {
        const sql = `SELECT * FROM Letters WHERE ...`;
        const rows = await ToolsDb.getQueryCallbackAsync(sql, [params.id]);
        return rows.map(row => this.mapRowToModel(row));
    }
}

// ❌ ANTI-PATTERN - Repository z walidacją:
async addInDb(item: Letter) {
    if (!item.number || item.number < 0) {  // ❌ Walidacja → Model
        throw new Error('Invalid number');
    }
    await ToolsDb.addInDb(this.tableName, item);
}
```

### **Model** - Domain Layer

```typescript
// ✅ WZORZEC SYGNATURY (czysta logika):
methodName(primitives: string | number | Date): returnType

// ✅ PRZYKŁAD - logika biznesowa:
class Letter {
    generateNumber(existingNumbers: string[]): string {
        // Czysta logika - bez I/O do DB
        const year = new Date().getFullYear();
        const lastNumber = this.findLastNumber(existingNumbers);
        return `${year}/${lastNumber + 1}`;
    }

    validate(): boolean {
        return !!this.description && !!this.registrationDate;
    }
}

// ✅ WYJĄTEK - operacje zewnętrzne (GD/Email):
class OurLetter extends Letter {
    async exportToPDF(auth: OAuth2Client): Promise<void> {
        // ✅ OK: Operacja GD (nie DB), Controller orkiestruje wywołanie
        if (!this.gdDocumentId) {
            throw new Error('No GD document');  // Walidacja biznesowa ✅
        }
        await ToolsGd.exportDocToPdfAndUpload(auth, this.gdDocumentId);
    }
}

// ❌ ANTI-PATTERN - Model z operacjami DB:
class Letter {
    async addInDb(): Promise<void> {
        await ToolsDb.addInDb('Letters', this);  // ❌ DB I/O → Controller
    }
}
```

---

## ⚠️ ERROR DETECTION: Anti-Patterns do wykrycia

### 🚨 **KRYTYCZNE BŁĘDY** (zawsze flaguj!)

#### 1. **Cykl zależności: Model importuje Controller**

```typescript
// ❌ BŁĄD - w pliku Letter.ts:
import LettersController from './LettersController';  // ❌ CYKL!

class Letter {
    async save() {
        await LettersController.add(this);  // ❌ Model → Controller
    }
}

// ✅ POPRAWNIE - Controller wywołuje Repository:
// W LettersController.ts:
static async add(letter: Letter) {
    await this.repository.addInDb(letter);
}
```

#### 2. **Model wykonuje operacje DB**

```typescript
// ❌ BŁĄD - w pliku Letter.ts:
class Letter {
    async addInDb() {
        await ToolsDb.addInDb('Letters', this); // ❌ DB I/O w Model
    }
}

// ✅ POPRAWNIE - przez Controller → Repository:
await LettersController.add(letter);
```

#### 3. **Repository zawiera logikę biznesową**

```typescript
// ❌ BŁĄD - w LetterRepository.ts:
async addInDb(letter: Letter) {
    // ❌ Walidacja to logika biznesowa → Model
    if (!letter.number || letter.number < 0) {
        throw new Error('Invalid number');
    }

    // ❌ Kalkulacja to logika biznesowa → Model
    letter.calculatedField = letter.price * 1.23;

    await ToolsDb.addInDb(this.tableName, letter);
}

// ✅ POPRAWNIE - walidacja w Model:
class Letter {
    validate(): boolean {
        return !!this.number && this.number >= 0;
    }
}
```

#### 4. **Router tworzy instancje lub zawiera logikę**

```typescript
// ❌ BŁĄD - w LettersRouters.ts:
router.post('/letters', async (req, res) => {
    const letter = new Letter(req.body); // ❌ Tworzenie → Controller
    letter.number = letter.id; // ❌ Logika → Controller
    await repository.addInDb(letter); // ❌ Bezpośrednie repo → Controller
    res.send(letter);
});

// ✅ POPRAWNIE - tylko wywołanie Controller:
router.post('/letters', async (req, res) => {
    const letter = LettersController.createProperLetter(req.body);
    await LettersController.add(letter);
    res.send(letter);
});
```

#### 5. **Repository zarządza transakcjami**

```typescript
// ❌ BŁĄD - w LetterRepository.ts:
async addWithAssociations(letter: Letter) {
    await ToolsDb.transaction(async (conn) => {  // ❌ Transakcja w Repo
        await this.addInDb(letter, conn);
        await this.addAssociations(letter, conn);  // ❌ Repo nie zna asocjacji
    });
}

// ✅ POPRAWNIE - transakcje w Controller:
class LettersController {
    static async add(letter: Letter) {
        return await ToolsDb.transaction(async (conn) => {
            await this.repository.addInDb(letter, conn, true);
            await this.addEntitiesAssociations(letter, conn);  // Controller orkiestruje
        });
    }
}
```

---

## 🎯 QUICK CHECKLIST dla AI

Przed zatwierdzeniem kodu sprawdź:

-   [ ] ❌ Model **NIE** importuje Controller ani Repository
-   [ ] ❌ Model **NIE** ma metod z `await ToolsDb.` (DB I/O)
-   [ ] ❌ Repository **NIE** ma `if (item.validate())` ani kalkulacji
-   [ ] ❌ Router **NIE** ma `new Model()` ani logiki biznesowej
-   [ ] ❌ Repository **NIE** zarządza transakcjami (`ToolsDb.transaction`)
-   [ ] ✅ Przepływ: Router → Controller → Repository → Model
-   [ ] ✅ Controller zarządza transakcjami
-   [ ] ✅ Repository dziedziczy po `BaseRepository<T>`
-   [ ] ✅ Controller dziedziczy po `BaseController<T, R>`

---

## 🔄 WZORCE IMPLEMENTACYJNE

### **Nowy CRUD dla encji:**

```typescript
// 1. MODEL (Domain/Model/Item.ts)
export class Item extends BusinessObject {
    name: string;
    price: number;

    validate(): boolean {
        return !!this.name && this.price > 0; // Logika biznesowa
    }
}

// 2. REPOSITORY (repositories/ItemRepository.ts)
export class ItemRepository extends BaseRepository<Item> {
    constructor() {
        super('Items'); // Nazwa tabeli
    }

    protected mapRowToModel(row: any): Item {
        return new Item({
            id: row.Id,
            name: row.Name,
            price: row.Price,
        });
    }

    async find(params?: ItemSearchParams): Promise<Item[]> {
        const sql = `SELECT * FROM Items WHERE Name LIKE ?`;
        const rows = await ToolsDb.getQueryCallbackAsync(sql, [
            `%${params.name}%`,
        ]);
        return rows.map((row) => this.mapRowToModel(row));
    }
}

// 3. CONTROLLER (controllers/ItemsController.ts)
export class ItemsController extends BaseController<Item, ItemRepository> {
    private static instance: ItemsController;

    constructor() {
        super(new ItemRepository());
    }

    private static getInstance(): ItemsController {
        if (!this.instance) {
            this.instance = new ItemsController();
        }
        return this.instance;
    }

    static async add(item: Item): Promise<Item> {
        const instance = this.getInstance();
        return await ToolsDb.transaction(async (conn) => {
            await instance.repository.addInDb(item, conn, true);
            return item;
        });
    }

    static async find(params?: ItemSearchParams): Promise<Item[]> {
        const instance = this.getInstance();
        return await instance.repository.find(params);
    }
}

// 4. ROUTER (routers/ItemsRouters.ts)
router.post('/items', async (req, res, next) => {
    try {
        const item = new Item(req.body);
        await ItemsController.add(item);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

router.get('/items', async (req, res, next) => {
    try {
        const items = await ItemsController.find(req.query);
        res.send(items);
    } catch (error) {
        next(error);
    }
});
```

---

## 📊 TABELA SZYBKIEGO ODNIESIENIA

| Warstwa        | Może                                                                              | Nie może                                                              | Typowy import                            |
| -------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| **Router**     | `req, res, next`<br/>Wywołać Controller<br/>Zwrócić HTTP                          | Tworzyć instancje Model<br/>Wywoływać Repository<br/>Logika biznesowa | `import Controller`                      |
| **Controller** | Orkiestrować operacje<br/>Zarządzać transakcjami<br/>Wywoływać Repository + Model | Pisać SQL<br/>Operować na `req/res`<br/>Logika biznesowa (→ Model)    | `import Repository`<br/>`import Model`   |
| **Repository** | Wykonywać SQL<br/>Mapować DB → Model<br/>CRUD operations                          | Walidować dane<br/>Kalkulować<br/>Zarządzać transakcjami              | `import Model`<br/>`import ToolsDb`      |
| **Model**      | Logika biznesowa<br/>Walidacja<br/>Kalkulacje<br/>GD/Email (z Controller)         | Importować Controller<br/>DB I/O (`ToolsDb`)<br/>HTTP (`req/res`)     | `import ToolsGd`<br/>`import ToolsEmail` |

---

## 🔗 Powiązane Dokumenty

-   [Podstawowe wytyczne](./architektura.instructions.md) - Quick reference (5 min)
-   [Szczegółowy przewodnik](./architektura-szczegoly.md) - Implementacje + przykłady (30 min)
-   [Wytyczne testowania](./architektura-testowanie.md) - Testing patterns (PLANNED)

---

**Wersja:** 1.0  
**Ostatnia aktualizacja:** 2024-10-28  
**Przeznaczenie:** GitHub Copilot, GPT-4, Claude, inne AI assistants
