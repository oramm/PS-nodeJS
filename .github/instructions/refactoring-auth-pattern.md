# Refactoring Guide: Migracja do withAuth Pattern

**Wersja:** 2.0  
**Data:** 2025-12-15  
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
4. ✅ **Milestones** - ZAKOŃCZONE (2025-11-14)
5. ✅ **Entities** - ZAKOŃCZONE (2025-11-12) - tylko DB, bez OAuth
6. ✅ **Invoices** - ZAKOŃCZONE (2025-11-12)
7. ✅ **Letters** - ZAKOŃCZONE (2025-11-14)
8. ✅ **FinancialAidProgrammes** - ZAKOŃCZONE (2025-12-15)
9. ✅ **Contracts** - ZAKOŃCZONE (2025-11-14)
10. ✅ **Persons** - ZAKOŃCZONE (2025-12-15) - wzorzec 2-poziomowy
11. ⏳ **Offers** - DO ZROBIENIA (średnia złożoność)
12. ⏳ **Meetings** - DO ZROBIENIA (niska złożoność)

---

## 🏗️ Wzorzec CRUD (uproszczony)

### **Struktura metod (2 poziomy):**

```
Router → addFromDto(dto) → add(item, auth?)     ← logika GD + DB inline
Router → editFromDto(dto, fields) → edit(item, fields, auth?) ← logika inline
Router → deleteFromDto(dto) → delete(item, auth?)             ← logika inline
```

**Zasada:** Maksymalnie 2 poziomy wywołań, logika biznesowa inline w `withAuth`.

---

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
import BaseController from '../controllers/BaseController';

export default class XController extends BaseController<X, XRepository> {
    private static instance: XController;

    constructor() {
        super(new XRepository());
    }
}
```

---

### **Krok 2: Controller - Metody CRUD (logika inline)**

> ⚠️ **UWAGA:** Metody `instance.create()`, `instance.edit()`, `instance.delete()` z BaseController są **@deprecated**.
> W nowym kodzie używaj bezpośrednio `instance.repository.addInDb()`, `instance.repository.editInDb()`, `instance.repository.deleteFromDb()`.
> Istniejący kod używający deprecated metod działa poprawnie, ale przy okazji refaktoru zaleca się migrację.

```typescript
/**
 * CREATE - tworzy obiekt z DTO
 * Router powinien wywoływać tę metodę.
 */
static async addFromDto(dto: XData, auth?: OAuth2Client): Promise<X> {
    const item = new X(dto);
    return await this.add(item, auth);
}

/**
 * CREATE - dodaje obiekt (GD + DB)
 */
static async add(item: X, auth?: OAuth2Client): Promise<X> {
    return await this.withAuth(async (instance, authClient) => {
        console.group('Creating new X');
        try {
            // 1. Operacje GD
            const gdFolder = await item.createFolder(authClient);
            item.setGdFolderId(gdFolder.id);
            console.log('Folder created');

            // 2. Zapis do DB - używaj bezpośrednio repository
            await instance.repository.addInDb(item);
            console.log('Added to db');

            console.groupEnd();
            return item;
        } catch (err) {
            console.groupEnd();
            // Rollback GD
            await item.deleteFolder(authClient).catch(console.error);
            throw err;
        }
    }, auth);
}

/**
 * READ - bez auth (tylko DB)
 */
static async find(params: XSearchParams[] = []): Promise<X[]> {
    const instance = this.getInstance();
    return await instance.repository.find(params);
}

/**
 * UPDATE - edytuje obiekt z DTO
 */
static async editFromDto(dto: XData, fieldsToUpdate: string[], auth?: OAuth2Client): Promise<X> {
    const item = new X(dto);
    return await this.edit(item, fieldsToUpdate, auth);
}

/**
 * UPDATE - edytuje obiekt (GD + DB)
 */
static async edit(item: X, fieldsToUpdate: string[], auth?: OAuth2Client): Promise<X> {
    return await this.withAuth(async (instance, authClient) => {
        console.group('Editing X');
        await item.updateFolder(authClient);
        console.log('Folder edited');
        // Używaj bezpośrednio repository
        await instance.repository.editInDb(item, undefined, undefined, fieldsToUpdate);
        console.log('Edited in db');
        console.groupEnd();
        return item;
    }, auth);
}

/**
 * DELETE - usuwa obiekt z DTO
 */
static async deleteFromDto(dto: XData, auth?: OAuth2Client): Promise<void> {
    const item = new X(dto);
    return await this.deleteX(item, auth);
}

/**
 * DELETE - usuwa obiekt (GD + DB)
 * Uwaga: nazwa `deleteX` zamiast `delete` jeśli konflikt z BaseController
 */
static async deleteX(item: X, auth?: OAuth2Client): Promise<void> {
    return await this.withAuth(async (instance, authClient) => {
        console.group('Deleting X');
        await Promise.all([
            // Używaj bezpośrednio repository
            instance.repository.deleteFromDb(item),
            item.deleteFolder(authClient),
        ]);
        console.log(`X ${item.id} deleted`);
        console.groupEnd();
    }, auth);
}
```

---

### **Krok 3: Router - Uproszczenie**

```typescript
// ✅ DOCELOWY WZORZEC - Router przekazuje DTO
app.post('/x', async (req, res, next) => {
    try {
        const result = await XController.addFromDto(req.parsedBody);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/x/:id', async (req, res, next) => {
    try {
        const result = await XController.editFromDto(
            req.parsedBody,
            req.body.fieldsToUpdate
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/x/:id', async (req, res, next) => {
    try {
        await XController.deleteFromDto(req.body);
        res.send({ success: true });
    } catch (error) {
        next(error);
    }
});
```

---

### **Krok 5: Model - Przekazywanie auth (jeśli wywołuje Controller)**

> ⚠️ **INSTRUKCJA PRZEJŚCIOWA** dla istniejących wywołań Model → Controller.
>
> **NOWY KOD NIE MOŻE tworzyć takich zależności!**
> Model importujący Controller tworzy **cykl zależności** - jest to zabronione.
>
> Szczegóły: [architektura-szczegoly.md - Unikanie Cykli Zależności](./architektura-szczegoly.md#7-unikanie-cykli-zależności)
>
> **Dozwolone rozwiązania dla nowego kodu:**
>
> 1. Controller orkiestruje wywołania (Model nie wie o innych Controllerach)
> 2. Dependency Injection przez parametry (funkcja jako argument)
> 3. Wydzielenie współdzielonej logiki do osobnego modułu

```typescript
// ❌ PRZED - Model wywołuje Controller bez przekazywania auth
async createRelatedItem(auth: OAuth2Client) {
    const item = new X({...});
    const result = await XController.add(item);  // ❌ Pobiera token PONOWNIE
    return result;
}

// ✅ PO (LEGACY) - Model przekazuje auth do Controller
// Tolerowane w istniejącym kodzie, ale NIE kopiuj tego wzorca!
async createRelatedItem(auth: OAuth2Client) {
    const item = new X({...});
    const result = await XController.add(item, auth);  // ✅ Używa istniejącego auth
    return result;
}

// ✅✅ DOCELOWO - Controller orkiestruje, Model nie importuje Controllera
// W Controller:
static async addWithRelated(item: X, auth?: OAuth2Client): Promise<X> {
    return await this.withAuth<X>(
        async (instance, authClient) => {
            const result = await instance.addItem(authClient, item);
            // Controller tworzy powiązany obiekt, NIE Model
            const related = new Related({...});
            await RelatedController.add(related, authClient);
            return result;
        },
        auth
    );
}
```

---

## 🔍 Checklist dla Każdego Modułu

### **1. Przygotowanie**

-   [ ] Przeczytaj ten dokument w całości
-   [ ] Sprawdź wzorzec referencyjny: `FinancialAidProgrammesController.ts`
-   [ ] Zidentyfikuj wszystkie metody używające `gapiReguestHandler`

### **2. Controller**

-   [ ] Zmień dziedziczenie na `extends BaseController<T, TRepository>`
-   [ ] Zaktualizuj konstruktor: `super(new TRepository())`
-   [ ] Dla każdej operacji CRUD:
    -   [ ] `addFromDto(dto, auth?)` → `add(item, auth?)` z logiką inline
    -   [ ] `editFromDto(dto, fields, auth?)` → `edit(item, fields, auth?)` z logiką inline
    -   [ ] `deleteFromDto(dto, auth?)` → `delete(item, auth?)` z logiką inline
-   [ ] Metody READ (bez auth) mogą pozostać statyczne bez `withAuth`

### **3. Router**

-   [ ] Usuń `import ToolsGapi`
-   [ ] Zamień `ToolsGapi.gapiReguestHandler(...)` na `await XController.addFromDto(...)`
-   [ ] Router przekazuje tylko DTO, nie tworzy Model

### **4. Testowanie**

-   [ ] Sprawdź kompilację: `yarn build`
-   [ ] Przetestuj CRUD endpoints
-   [ ] Sprawdź logi OAuth

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
// ❌ PROBLEM - używa this w static method
static async add(item: X) {
    await this.repository.addInDb(item);  // ❌ this nie istnieje
}

// ✅ ROZWIĄZANIE - używa instance przez withAuth
static async add(item: X, auth?: OAuth2Client) {
    return await this.withAuth(async (instance, authClient) => {
        await instance.repository.addInDb(item);  // ✅ przez repository
    }, auth);
}
```

### **Problem 3: Konflikt nazwy metody z BaseController**

```typescript
// ❌ PROBLEM - `edit` i `delete` kolidują z BaseController (deprecated)
static async edit(...) { ... }  // ❌ konflikt z deprecated metodą

// ✅ ROZWIĄZANIE - użyj innej nazwy i wywołuj repository bezpośrednio
static async editProgramme(item, fields, auth?) {
    return await this.withAuth(async (instance, authClient) => {
        await instance.repository.editInDb(item, undefined, undefined, fields);  // ✅ przez repository
    }, auth);
}
```

---

## 📊 Przykład Kompletny: FinancialAidProgrammesController

```typescript
import BaseController from '../controllers/BaseController';

export default class FinancialAidProgrammesController extends BaseController<
    FinancialAidProgramme,
    FinancialAidProgrammeRepository
> {
    private static instance: FinancialAidProgrammesController;

    constructor() {
        super(new FinancialAidProgrammeRepository());
    }

    private static getInstance() {
        if (!this.instance)
            this.instance = new FinancialAidProgrammesController();
        return this.instance;
    }

    // READ - bez auth
    static async find(params = []) {
        const instance = this.getInstance();
        return await instance.repository.find(params);
    }

    // CREATE z DTO
    static async addFromDto(dto, auth?) {
        const item = new FinancialAidProgramme(dto);
        return await this.add(item, auth);
    }

    // CREATE - logika inline
    static async add(item, auth?) {
        return await this.withAuth(async (instance, authClient) => {
            const gdController = new FinancialAidProgrammeGdController();
            console.group('Creating new Programme');
            try {
                const gdFolder = await gdController.createFolder(
                    authClient,
                    item
                );
                item.setGdFolderIdAndUrl(gdFolder.id);
                // Używaj bezpośrednio repository (instance.create jest @deprecated)
                await instance.repository.addInDb(item);
                console.groupEnd();
                return item;
            } catch (err) {
                console.groupEnd();
                await gdController
                    .deleteFromGd(authClient, item.gdFolderId)
                    .catch(console.error);
                throw err;
            }
        }, auth);
    }

    // UPDATE z DTO
    static async editFromDto(dto, fieldsToUpdate, auth?) {
        const item = new FinancialAidProgramme(dto);
        return await this.editProgramme(item, fieldsToUpdate, auth);
    }

    // UPDATE - logika inline
    static async editProgramme(item, fieldsToUpdate, auth?) {
        return await this.withAuth(async (instance, authClient) => {
            const gdController = new FinancialAidProgrammeGdController();
            console.group('Editing Programme');
            await ToolsGd.updateFolder(authClient, {
                name: gdController.makeFolderName(item),
                id: item.gdFolderId,
            });
            // Używaj bezpośrednio repository (instance.edit jest @deprecated)
            await instance.repository.editInDb(
                item,
                undefined,
                undefined,
                fieldsToUpdate
            );
            console.groupEnd();
            return item;
        }, auth);
    }

    // DELETE z DTO
    static async deleteFromDto(dto, auth?) {
        const item = new FinancialAidProgramme(dto);
        return await this.deleteProgramme(item, auth);
    }

    // DELETE - logika inline
    static async deleteProgramme(item, auth?) {
        return await this.withAuth(async (instance, authClient) => {
            const gdController = new FinancialAidProgrammeGdController();
            console.group('Deleting Programme');
            await Promise.all([
                // Używaj bezpośrednio repository (instance.delete jest @deprecated)
                instance.repository.deleteFromDb(item),
                gdController.deleteFromGd(authClient, item.gdFolderId),
            ]);
            console.groupEnd();
        }, auth);
    }
}
```

---

## ✅ Walidacja po Refaktoryzacji

### **1. Kompilacja**

```bash
yarn build
```

### **2. Logi runtime**

-   ✅ `Using existing OAuth2Client` - gdy auth przekazany
-   ✅ `Fetching new OAuth token` - gdy auth nie przekazany

### **3. Code Review**

-   [ ] Brak `import ToolsGapi` w Routerach
-   [ ] Controller dziedziczy po `BaseController`
-   [ ] Metody CRUD: `addFromDto → add`, `editFromDto → edit`, `deleteFromDto → delete`
-   [ ] Logika inline w `withAuth` (bez osobnych metod prywatnych)

---

## 📚 Dodatkowe Zasoby

-   **Wzorzec referencyjny:** `src/financialAidProgrammes/FinancialAidProgrammesController.ts`
-   **BaseController:** `src/controllers/BaseController.ts`
-   **Wytyczne Clean Architecture:** `.github/instructions/architektura.instructions.md`

---

**Powodzenia w refaktoryzacji! 🚀**
