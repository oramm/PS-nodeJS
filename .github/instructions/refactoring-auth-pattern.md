# Refactoring Guide: Migracja do withAuth Pattern

**Wersja:** 1.0  
**Data:** 2025-11-11  
**Status:** OBOWIĄZUJĄCY  
**Priorytet:** ŚREDNI

---

## 🎯 Cel Refaktoryzacji

Migracja modułów używających `ToolsGapi.gapiReguestHandler` do nowego wzorca `BaseController.withAuth`, który:

-   ✅ Eliminuje `gapiReguestHandler` z Routerów
-   ✅ Zapewnia pełne **type safety** (TypeScript)
-   ✅ Eliminuje duplikację pobierania OAuth tokenu
-   ✅ Upraszcza API i zmniejsza boilerplate
-   ✅ Zachowuje kompatybilność wsteczną

---

## 📋 Zakres Zmian

### **Moduły do Refaktoryzacji:**

1. ✅ **Cases** - ZAKOŃCZONE (wzorzec referencyjny)
2. ✅ **Tasks** - ZAKOŃCZONE (2025-11-12)
3. ✅ **Projects** - ZAKOŃCZONE (2025-11-12) - już zrefaktoryzowane wcześniej
4. ⚠️ **Milestones** - CZĘŚCIOWO ZAKOŃCZONE (2025-11-12)
    - ✅ Controller zrefaktoryzowany (add/edit/delete z withAuth)
    - ⏳ Router ma 1 endpoint używający ToolsGapi (wymaga refaktoryzacji Contracts)
5. ✅ **Entities** - ZAKOŃCZONE (2025-11-12) - tylko DB, bez OAuth
6. ⏳ **Letters** - DO ZROBIENIA
7. ⏳ **Offers** - DO ZROBIENIA
8. ⏳ **Contracts** - DO ZROBIENIA
9. ⏳ **Invoices** - DO ZROBIENIA
10. ⏳ **Meetings** - DO ZROBIENIA

---

## 🏗️ Wzorzec Refaktoryzacji (na podstawie Cases)

### **Krok 1: Controller - Dziedziczenie po BaseController**

```typescript
// ❌ PRZED
export default class XController {
    private static instance: XController;
    private repository: XRepository;

    constructor() {
        this.repository = new XRepository();
    }
}

// ✅ PO
import BaseController from '../../../controllers/BaseController';

export default class XController extends BaseController<X, XRepository> {
    private static instance: XController;

    constructor() {
        super(new XRepository()); // ✅ Przekaż repository do konstruktora bazowego
    }
}
```

---

### **Krok 2: Controller - Podział metod na Public API i Private Logic**

```typescript
// ❌ PRZED - jedna metoda statyczna z auth jako parametr
static async add(auth: OAuth2Client, item: X): Promise<X> {
    const instance = this.getInstance();

    // 1. Operacje GD
    await item.createFolder(auth);

    // 2. Transakcja DB
    await ToolsDb.transaction(async (conn) => {
        await instance.repository.addInDb(item, conn, true);
    });

    // 3. Post-processing
    await item.editFolder(auth);

    return item;
}

// ✅ PO - public wrapper + private logika
/**
 * API PUBLICZNE (dla Routera i innych klas)
 * @param item - Obiekt do dodania
 * @param auth - Opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze token)
 */
static async add(item: X, auth?: OAuth2Client): Promise<X> {
    return await this.withAuth<X>(
        async (instance: XController, authClient: OAuth2Client) => {
            return await instance.addItem(authClient, item);
        },
        auth  // ✅ Przekaż auth jeśli istnieje
    );
}

/**
 * LOGIKA BIZNESOWA (prywatna)
 * @param auth - OAuth2Client dla operacji GD
 * @param item - Obiekt do dodania
 */
private async addItem(auth: OAuth2Client, item: X): Promise<X> {
    console.group('XController.addItem()');

    try {
        // 1. Operacje GD
        await item.createFolder(auth);

        // 2. Transakcja DB
        await ToolsDb.transaction(async (conn) => {
            await this.repository.addInDb(item, conn, true);
        });

        // 3. Post-processing
        await item.editFolder(auth);

        return item;
    } catch (err) {
        // Rollback
        await item.deleteFolder(auth).catch(console.error);
        throw err;
    } finally {
        console.groupEnd();
    }
}
```

---

### **Krok 3: Controller - Wszystkie metody CRUD**

```typescript
// ✅ CREATE
static async add(item: X, auth?: OAuth2Client): Promise<X> {
    return await this.withAuth<X>(
        async (instance: XController, authClient: OAuth2Client) => {
            return await instance.addItem(authClient, item);
        },
        auth
    );
}
private async addItem(auth: OAuth2Client, item: X): Promise<X> { /* logika */ }

// ✅ READ - bez auth (tylko DB)
static async find(orConditions: XSearchParams[] = []): Promise<X[]> {
    const instance = this.getInstance();
    return await instance.repository.find(orConditions);
}

// ✅ UPDATE
static async edit(item: X, auth?: OAuth2Client): Promise<X> {
    return await this.withAuth<X>(
        async (instance: XController, authClient: OAuth2Client) => {
            return await instance.editItem(authClient, item);
        },
        auth
    );
}
private async editItem(auth: OAuth2Client, item: X): Promise<X> { /* logika */ }

// ✅ DELETE
static async delete(item: X, auth?: OAuth2Client): Promise<void> {
    return await this.withAuth<void>(
        async (instance: XController, authClient: OAuth2Client) => {
            return await instance.deleteItem(authClient, item);
        },
        auth
    );
}
private async deleteItem(auth: OAuth2Client, item: X): Promise<void> { /* logika */ }
```

---

### **Krok 4: Router - Uproszczenie (bez gapiReguestHandler)**

```typescript
// ❌ PRZED - skomplikowane, podatne na błędy
import ToolsGapi from '../../../setup/Sessions/ToolsGapi';

app.post('/x', async (req: Request, res: Response, next) => {
    try {
        const item = new X(req.parsedBody);

        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            XController.add,
            [item], // ⚠️ Łatwo zapomnieć tablicy
            XController // ⚠️ Łatwo zapomnieć context
        );

        res.send(item);
    } catch (error) {
        next(error);
    }
});

// ✅ PO - proste, type-safe
// USUŃ import ToolsGapi

app.post('/x', async (req: Request, res: Response, next) => {
    try {
        const item = new X(req.parsedBody);

        // ✅ Bezpośrednie wywołanie - withAuth zarządza auth wewnętrznie
        const result = await XController.add(item);

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/x/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new X(req.parsedBody);

        const result = await XController.edit(item);

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/x/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new X(req.body);

        await XController.delete(item);

        res.send(item);
    } catch (error) {
        next(error);
    }
});
```

---

### **Krok 5: Model - Przekazywanie auth (jeśli wywołuje Controller)**

```typescript
// ❌ PRZED - Model wywołuje Controller bez przekazywania auth
async createRelatedItem(auth: OAuth2Client) {
    const item = new X({...});
    const result = await XController.add(item);  // ❌ Pobiera token PONOWNIE
    return result;
}

// ✅ PO - Model przekazuje auth do Controller
async createRelatedItem(auth: OAuth2Client) {
    const item = new X({...});
    const result = await XController.add(item, auth);  // ✅ Używa istniejącego auth
    return result;
}
```

---

## 🔍 Checklist dla Każdego Modułu

### **1. Przygotowanie**

-   [ ] Przeczytaj ten dokument w całości
-   [ ] Sprawdź wzorzec referencyjny: `CasesController.ts`, `CasesRouters.ts`
-   [ ] Zidentyfikuj wszystkie metody używające `gapiReguestHandler`

### **2. Controller**

-   [ ] Zmień dziedziczenie na `extends BaseController<T, TRepository>`
-   [ ] Zaktualizuj konstruktor: `super(new TRepository())`
-   [ ] Dla każdej metody z auth:
    -   [ ] Stwórz public static wrapper z `auth?: OAuth2Client`
    -   [ ] Przenieś logikę do private instance method
    -   [ ] Wrapper wywołuje `this.withAuth(callback, auth)`
-   [ ] Metody READ (bez auth) mogą pozostać statyczne bez `withAuth`

### **3. Router**

-   [ ] Usuń `import ToolsGapi`
-   [ ] Zamień `ToolsGapi.gapiReguestHandler(...)` na bezpośrednie `await XController.method(...)`
-   [ ] Usuń parametry `req, res` z wywołań Controller
-   [ ] Usuń tablice z argumentów: `[item]` → `item`
-   [ ] Usuń context: usuń ostatni parametr `XController`

### **4. Model (jeśli wywołuje Controller)**

-   [ ] Znajdź wszystkie wywołania `XController.method(item)`
-   [ ] Dodaj parametr `auth`: `XController.method(item, auth)`
-   [ ] Upewnij się że metoda Modelu ma dostęp do `auth: OAuth2Client`

### **5. Testowanie**

-   [ ] Sprawdź kompilację: `yarn build` lub `tsc --noEmit`
-   [ ] Uruchom serwer: `yarn start`
-   [ ] Przetestuj CREATE endpoint
-   [ ] Przetestuj READ endpoint
-   [ ] Przetestuj UPDATE endpoint
-   [ ] Przetestuj DELETE endpoint
-   [ ] Sprawdź logi - powinno być `Using existing OAuth2Client` gdy auth przekazany
-   [ ] Sprawdź logi - powinno być `Fetching new OAuth token` gdy auth nie przekazany

---

## 🚨 Typowe Pułapki i Rozwiązania

### **Problem 1: Property 'withAuth' does not exist**

```typescript
// ❌ PROBLEM
export default class XController {
    // Nie dziedziczy po BaseController
}

// ✅ ROZWIĄZANIE
export default class XController extends BaseController<X, XRepository> {
    constructor() {
        super(new XRepository());
    }
}
```

### **Problem 2: Cannot read properties of undefined (reading 'repository')**

```typescript
// ❌ PROBLEM - używa this.repository w static method
static async add(item: X) {
    await this.repository.addInDb(item);  // ❌ this.repository nie istnieje
}

// ✅ ROZWIĄZANIE - używa instance.repository przez withAuth
static async add(item: X, auth?: OAuth2Client) {
    return await this.withAuth<X>(
        async (instance: XController, authClient: OAuth2Client) => {
            return await instance.addItem(authClient, item);  // ✅
        },
        auth
    );
}
private async addItem(auth: OAuth2Client, item: X) {
    await this.repository.addInDb(item);  // ✅ this = instance
}
```

### **Problem 3: Podwójne pobieranie tokenu**

```typescript
// ❌ PROBLEM - Model NIE przekazuje auth
async createX(auth: OAuth2Client) {
    const item = new X({...});
    const result = await XController.add(item);  // ❌ Pobiera token PONOWNIE
    return result;
}

// ✅ ROZWIĄZANIE - Model przekazuje auth
async createX(auth: OAuth2Client) {
    const item = new X({...});
    const result = await XController.add(item, auth);  // ✅ Używa istniejącego
    return result;
}
```

### **Problem 4: Expected 1 arguments, but got 2 (po refaktoryzacji)**

```typescript
// ❌ PROBLEM - stare wywołanie po refaktoryzacji Controller
const result = await XController.add(auth, item); // ❌ Stary pattern

// ✅ ROZWIĄZANIE - nowy pattern
const result = await XController.add(item, auth); // ✅ auth jako ostatni (opcjonalny)
```

---

## 📊 Przykład Kompletnej Refaktoryzacji

### **PRZED (Stary Pattern)**

```typescript
// XController.ts
export default class XController {
    private static instance: XController;
    private repository: XRepository;

    constructor() {
        this.repository = new XRepository();
    }

    private static getInstance(): XController {
        if (!this.instance) this.instance = new XController();
        return this.instance;
    }

    static async add(auth: OAuth2Client, item: X): Promise<X> {
        const instance = this.getInstance();
        await item.createFolder(auth);
        await ToolsDb.transaction(async (conn) => {
            await instance.repository.addInDb(item, conn, true);
        });
        await item.editFolder(auth);
        return item;
    }
}

// XRouters.ts
import ToolsGapi from '../setup/Sessions/ToolsGapi';

app.post('/x', async (req, res, next) => {
    try {
        const item = new X(req.parsedBody);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            XController.add,
            [item],
            XController
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});
```

### **PO (Nowy Pattern)**

```typescript
// XController.ts
import BaseController from '../controllers/BaseController';

export default class XController extends BaseController<X, XRepository> {
    private static instance: XController;

    constructor() {
        super(new XRepository());
    }

    private static getInstance(): XController {
        if (!this.instance) this.instance = new XController();
        return this.instance;
    }

    /**
     * API PUBLICZNE
     * @param item - Obiekt do dodania
     * @param auth - Opcjonalny OAuth2Client
     */
    static async add(item: X, auth?: OAuth2Client): Promise<X> {
        return await this.withAuth<X>(
            async (instance: XController, authClient: OAuth2Client) => {
                return await instance.addItem(authClient, item);
            },
            auth
        );
    }

    /**
     * LOGIKA BIZNESOWA (prywatna)
     */
    private async addItem(auth: OAuth2Client, item: X): Promise<X> {
        console.group('XController.addItem()');
        try {
            await item.createFolder(auth);
            await ToolsDb.transaction(async (conn) => {
                await this.repository.addInDb(item, conn, true);
            });
            await item.editFolder(auth);
            return item;
        } catch (err) {
            await item.deleteFolder(auth).catch(console.error);
            throw err;
        } finally {
            console.groupEnd();
        }
    }
}

// XRouters.ts
// ✅ USUŃ import ToolsGapi

app.post('/x', async (req, res, next) => {
    try {
        const item = new X(req.parsedBody);
        const result = await XController.add(item); // ✅ Proste wywołanie
        res.send(result);
    } catch (error) {
        next(error);
    }
});
```

---

## 🎓 Najlepsze Praktyki

### **1. Nazewnictwo metod**

```typescript
// ✅ DOBRZE - wyraźny podział
static async add(item: X, auth?: OAuth2Client)      // Public API
private async addItem(auth: OAuth2Client, item: X)  // Private logic

static async edit(item: X, auth?: OAuth2Client)
private async editItem(auth: OAuth2Client, item: X)

static async delete(item: X, auth?: OAuth2Client)
private async deleteItem(auth: OAuth2Client, item: X)
```

### **2. Kolejność parametrów**

```typescript
// ✅ DOBRZE - auth zawsze ostatni (zgodnie z wytycznymi)
static async add(item: X, auth?: OAuth2Client)

// ✅ DOBRZE - w prywatnej metodzie auth pierwszy (zgodnie z Google API convention)
private async addItem(auth: OAuth2Client, item: X)
```

### **3. Dokumentacja**

```typescript
/**
 * API PUBLICZNE (dla Routera i innych klas)
 * Dodaje nowy obiekt X do systemu
 *
 * @param item - Obiekt X do dodania
 * @param auth - Opcjonalny OAuth2Client (jeśli nie przekazany, withAuth pobierze token)
 * @returns Promise<X> - Dodany obiekt z uzupełnionymi danymi
 */
static async add(item: X, auth?: OAuth2Client): Promise<X> { ... }

/**
 * LOGIKA BIZNESOWA (prywatna)
 * Dodaje obiekt X - orkiestruje GD, DB i post-processing
 *
 * @param auth - OAuth2Client dla operacji Google Drive
 * @param item - Obiekt X do dodania
 * @returns Promise<X> - Dodany obiekt
 */
private async addItem(auth: OAuth2Client, item: X): Promise<X> { ... }
```

### **4. Console logs**

```typescript
private async addItem(auth: OAuth2Client, item: X): Promise<X> {
    console.group('XController.addItem()');  // ✅ Grupuj logi
    try {
        // logika...
        console.log('added in db');  // ✅ Kluczowe punkty
    } finally {
        console.groupEnd();  // ✅ Zawsze zamknij grupę
    }
}
```

---

## 📝 Szablon dla Nowego Modułu

```typescript
// XController.ts
import BaseController from '../controllers/BaseController';
import XRepository, { XSearchParams } from './XRepository';
import X from './X';
import { OAuth2Client } from 'google-auth-library';
import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';

export default class XController extends BaseController<X, XRepository> {
    private static instance: XController;

    constructor() {
        super(new XRepository());
    }

    private static getInstance(): XController {
        if (!this.instance) this.instance = new XController();
        return this.instance;
    }

    // ==================== READ (bez auth) ====================
    static async find(orConditions: XSearchParams[] = []): Promise<X[]> {
        const instance = this.getInstance();
        return await instance.repository.find(orConditions);
    }

    // ==================== CREATE ====================
    static async add(item: X, auth?: OAuth2Client): Promise<X> {
        return await this.withAuth<X>(
            async (instance: XController, authClient: OAuth2Client) => {
                return await instance.addItem(authClient, item);
            },
            auth
        );
    }

    private async addItem(auth: OAuth2Client, item: X): Promise<X> {
        console.group('XController.addItem()');
        try {
            // 1. GD operations
            await item.createFolder(auth);

            // 2. DB transaction
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.addInDb(item, conn, true);
            });

            // 3. Post-processing
            await item.editFolder(auth);

            return item;
        } catch (err) {
            // Rollback
            await item.deleteFolder(auth).catch(console.error);
            throw err;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== UPDATE ====================
    static async edit(item: X, auth?: OAuth2Client): Promise<X> {
        return await this.withAuth<X>(
            async (instance: XController, authClient: OAuth2Client) => {
                return await instance.editItem(authClient, item);
            },
            auth
        );
    }

    private async editItem(auth: OAuth2Client, item: X): Promise<X> {
        console.group('XController.editItem()');
        try {
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.editInDb(item, conn, true);
            });
            await item.editFolder(auth);
            return item;
        } finally {
            console.groupEnd();
        }
    }

    // ==================== DELETE ====================
    static async delete(item: X, auth?: OAuth2Client): Promise<void> {
        return await this.withAuth<void>(
            async (instance: XController, authClient: OAuth2Client) => {
                return await instance.deleteItem(authClient, item);
            },
            auth
        );
    }

    private async deleteItem(auth: OAuth2Client, item: X): Promise<void> {
        console.group('XController.deleteItem()');
        try {
            await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
                await this.repository.deleteFromDb(item, conn, true);
            });
            await item.deleteFolder(auth);
        } finally {
            console.groupEnd();
        }
    }
}
```

---

## 🔄 Kolejność Refaktoryzacji Modułów (Rekomendowana)

1. ~~**Projects**~~ - ✅ ZAKOŃCZONE (już zrefaktoryzowane wcześniej)
2. **Letters** - podobny do Cases, średnia złożoność
3. **Offers** - średnia złożoność
4. **Milestones** - powiązany z Cases
5. **Contracts** - częściowo zrefaktoryzowany (ContractsController.find już używa getInstance)
6. **Invoices** - średnia złożoność
7. **Meetings** - niska złożoność

---

## ✅ Walidacja po Refaktoryzacji

### **1. Kompilacja**

```bash
yarn build
# lub
tsc --noEmit
```

### **2. Logi runtime**

Sprawdź w konsoli:

-   ✅ `Using existing OAuth2Client (no token refresh)` - gdy auth przekazany
-   ✅ `Fetching new OAuth token from REFRESH_TOKEN` - gdy auth nie przekazany

### **3. Funkcjonalność**

-   [ ] CREATE działa poprawnie (DB + GD)
-   [ ] READ zwraca dane
-   [ ] UPDATE aktualizuje (DB + GD)
-   [ ] DELETE usuwa (DB + GD)

### **4. Code Review**

-   [ ] Brak `import ToolsGapi` w Routerach
-   [ ] Wszystkie metody z auth mają `auth?: OAuth2Client`
-   [ ] Controller dziedziczy po `BaseController`
-   [ ] Private methods używają `this.repository`
-   [ ] Dokumentacja JSDoc zaktualizowana

---

## 📚 Dodatkowe Zasoby

-   **Wzorce referencyjne:**
    -   `src/contracts/milestones/cases/CasesController.ts` + `CasesRouters.ts`
    -   `src/projects/ProjectsController.ts` + `ProjectsRouters.ts`
    -   `src/contracts/milestones/cases/tasks/TasksController.ts` + `TasksRouters.ts`
-   **BaseController:** `src/controllers/BaseController.ts`
-   **Wytyczne Clean Architecture:** `.github/instructions/architektura.instructions.md`

---

## 🤝 Wsparcie

W razie pytań lub problemów:

1. Sprawdź sekcję "Typowe Pułapki i Rozwiązania"
2. Porównaj z wzorcem referencyjnym (CasesController)
3. Sprawdź logi kompilacji i runtime
4. Skonsultuj z AI używając tego dokumentu jako kontekstu

---

**Powodzenia w refaktoryzacji! 🚀**
