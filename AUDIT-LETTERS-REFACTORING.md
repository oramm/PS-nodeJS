# Audyt Refaktoringu Letters - Weryfikacja Integralności Danych

**Data:** 2025-11-14  
**Moduł:** Letters (LettersController + LettersRouters)  
**Status:** ✅ ZAKOŃCZONY - NIE WYKRYTO UTRATY DANYCH

---

## 🎯 Cel Audytu

Weryfikacja czy refaktoring z `ToolsGapi.gapiReguestHandler` na `withAuth` pattern **NIE spowodował utraty funkcjonalności ani danych** zwracanych do klienta.

**Kluczowe pytanie:** Czy `res.send(item)` w Routerze otrzymuje **pełny obiekt z wszystkimi mutacjami** wykonanymi przez Controller?

---

## 📋 Metodologia

Dla każdego endpointu sprawdzam:

1. **BEFORE** - jak `gapiReguestHandler` modyfikował `item` (poprzez wywołanie metody na obiekcie)
2. **AFTER** - czy `LettersController.metoda()` nadal mutuje `item` **in-place**
3. **Krytyczne pola** - czy `gdFolderId`, `gdDocumentId`, `number`, `_lastEvent`, etc. są ustawiane
4. **Timing** - czy wszystkie mutacje kończą się **przed** `res.send(item)`

---

## 🔍 Audyt Endpointów

### 1. POST `/letterReact` - Dodawanie OurLetter

#### ✅ PRZED (gapiReguestHandler):

```typescript
// Router - STARY KOD
await ToolsGapi.gapiReguestHandler(
    req, res,
    LettersController.addNewOurLetter,
    [item, req.files, req.session.userData],
    LettersController
);
res.send(item); // ⬅️ item zmutowany przez addNewOurLetter?

// Controller - STARY KOD
static async addNewOurLetter(
    auth: OAuth2Client,
    letter: OurLetter,
    files: Express.Multer.File[],
    userData: UserData
): Promise<void> {
    // Mutacje item:
    letter.gdFolderId = <string>gdFolder.id;             // ✅ SET
    letter._gdFolderUrl = ToolsGd.createGdFolderUrl(...); // ✅ SET
    letter.gdDocumentId = <string>letterGdFile.documentId; // ✅ SET
    letter._documentOpenUrl = ToolsGd.createDocumentOpenUrl(...); // ✅ SET

    await LettersController.addNew(letter); // ⬅️ ustawia letter.id, letter.number

    // ... dalsze operacje GD (updateFolder, updateFile)
}
```

**Wynik PRZED:** `item` zwrócony do klienta ma:

-   ✅ `gdFolderId`, `_gdFolderUrl`
-   ✅ `gdDocumentId`, `_documentOpenUrl`
-   ✅ `id`, `number` (z addNew)

---

#### ✅ PO (withAuth):

```typescript
// Router - NOWY KOD
await LettersController.addNewOurLetter(
    item,
    files,
    req.session.userData
); // ⬅️ withAuth wewnątrz
res.send(item); // ⬅️ item zmutowany?

// Controller - NOWY KOD
static async addNewOurLetter(
    letter: OurLetter,
    files: Express.Multer.File[] = [],
    userData: UserData,
    auth?: OAuth2Client
): Promise<void> {
    return await this.withAuth<void>(
        async (instance, authClient) => {
            return await instance.addNewOurLetterPrivate(
                authClient, letter, files, userData
            );
        },
        auth
    );
}

private async addNewOurLetterPrivate(
    auth: OAuth2Client,
    letter: OurLetter,
    files: Express.Multer.File[],
    userData: UserData
): Promise<void> {
    // TE SAME MUTACJE co w starym kodzie:
    letter.gdFolderId = <string>gdFolder.id;             // ✅ SET
    letter._gdFolderUrl = ToolsGd.createGdFolderUrl(...); // ✅ SET
    letter.gdDocumentId = <string>letterGdFile.documentId; // ✅ SET
    letter._documentOpenUrl = ToolsGd.createDocumentOpenUrl(...); // ✅ SET

    await LettersController.addNew(letter); // ⬅️ ustawia letter.id, letter.number

    // ... dalsze operacje GD (updateFolder, updateFile)
}
```

**Wynik PO:** `item` zwrócony do klienta ma:

-   ✅ `gdFolderId`, `_gdFolderUrl`
-   ✅ `gdDocumentId`, `_documentOpenUrl`
-   ✅ `id`, `number` (z addNew)

**✅ WNIOSEK:** **ŻADNEJ UTRATY DANYCH** - `letter` jest mutowany **in-place** przez `addNewOurLetterPrivate()`, wszystkie pola są ustawiane **przed** `res.send(item)`.

---

### 2. POST `/letterReact` - Dodawanie IncomingLetter

#### ✅ PRZED:

```typescript
await ToolsGapi.gapiReguestHandler(
    req,
    res,
    LettersController.addNewIncomingLetter,
    [item, req.files, req.session.userData],
    LettersController
);

// Mutacje:
letter.gdDocumentId = <string>document.documentId; // ✅ SET
letter.gdFolderId = <string>document.folderId; // ✅ SET
await LettersController.addNew(letter); // ⬅️ ustawia letter.id, letter.number
```

#### ✅ PO:

```typescript
await LettersController.addNewIncomingLetter(item, files, req.session.userData);

// Mutacje (addNewIncomingLetterPrivate):
letter.gdDocumentId = <string>document.documentId; // ✅ SET
letter.gdFolderId = <string>document.folderId; // ✅ SET
await LettersController.addNew(letter); // ⬅️ ustawia letter.id, letter.number
```

**✅ WNIOSEK:** **BRAK UTRATY DANYCH** - te same mutacje in-place.

---

### 3. PUT `/letter/:id` - Edycja Letter

#### ✅ PRZED:

```typescript
await ToolsGapi.gapiReguestHandler(
    req, res,
    LettersController.editLetter,
    [item, req.files, req.session.userData, _fieldsToUpdate],
    LettersController
);

// editLetter:
await LettersController.edit(letter, fieldsToUpdate); // ⬅️ tylko DB, item niezmieniony
// Jeśli !onlyDbFields:
await ourLetterGdFile.updateTextRunsInNamedRanges(auth); // ⬅️ zmienia GD, ale nie item
await ToolsGd.updateFolder(...); // ⬅️ zmienia GD, ale nie item
```

**Uwaga:** `editLetter` **NIE mutuje `item`** - tylko aktualizuje DB i GD. Klient otrzymuje **niezmieniony `item`** z request.

#### ✅ PO:

```typescript
await LettersController.editLetter(
    item,
    files,
    req.session.userData,
    _fieldsToUpdate
);

// editLetterPrivate:
await LettersController.edit(letter, fieldsToUpdate); // ⬅️ tylko DB
// Jeśli !onlyDbFields:
await ourLetterGdFile.updateTextRunsInNamedRanges(auth);
await ToolsGd.updateFolder(...);
```

**✅ WNIOSEK:** **BRAK ZMIAN W ZACHOWANIU** - `item` nie jest mutowany ani w PRZED, ani w PO. Klient otrzymuje ten sam obiekt co wysłał.

---

### 4. PUT `/exportOurLetterToPDF` - Eksport do PDF

#### ✅ PRZED:

```typescript
await ToolsGapi.gapiReguestHandler(
    req,
    res,
    LettersController.exportToPDF,
    [item],
    LettersController
);

// exportToPDF wywołuje:
await letter.exportToPDF(auth); // ⬅️ OurLetter.exportToPDF()
// OurLetter.exportToPDF():
await ToolsGd.exportDocToPdfAndUpload(auth, this.gdDocumentId);
// ⬅️ NIE mutuje `letter`, tylko tworzy plik PDF na GD
```

**Uwaga:** `exportToPDF` **NIE mutuje `item`** - tylko tworzy PDF na Google Drive.

#### ✅ PO:

```typescript
await LettersController.exportToPDF(item);

// exportToPDFPrivate:
await letter.exportToPDF(auth);
// OurLetter.exportToPDF():
await ToolsGd.exportDocToPdfAndUpload(auth, this.gdDocumentId);
// ⬅️ NIE mutuje `letter`
```

**✅ WNIOSEK:** **BRAK ZMIAN W ZACHOWANIU** - `item` nie jest mutowany ani w PRZED, ani w PO.

---

### 5. PUT `/approveOurLetter/:id` - Zatwierdzanie pisma

#### ✅ PRZED:

```typescript
await ToolsGapi.gapiReguestHandler(
    req,
    res,
    LettersController.approveLetter,
    [item, req.session.userData],
    LettersController
);

// approveLetter:
const event = item.createApprovedEvent(editor); // ⬅️ tworzy LetterEvent (APPROVED)
await LetterEventsController.addNew(event, auth); // ⬅️ zapisuje event w DB
// ⬅️ NIE mutuje `item` (item._lastEvent NIE jest ustawiane automatycznie)
```

**Uwaga:** `approveLetter` **NIE mutuje `item._lastEvent`** - tworzy tylko event w DB.

#### ✅ PO:

```typescript
await LettersController.approveLetter(item, req.session.userData);

// approveLetterPrivate:
const event = letter.createApprovedEvent(editor);
await LetterEventsController.addNew(event, auth);
// ⬅️ NIE mutuje `letter`
```

**✅ WNIOSEK:** **BRAK ZMIAN W ZACHOWANIU** - `item._lastEvent` nie jest mutowany ani w PRZED, ani w PO. Klient musi wykonać osobne zapytanie o events jeśli chce zaktualizować UI.

---

### 6. PUT `/appendLetterAttachments/:id` - Dodawanie załączników

#### ✅ PRZED:

```typescript
await ToolsGapi.gapiReguestHandler(
    req,
    res,
    item.appendAttachmentsHandler,
    [req.body._blobEnviObjects],
    item
);
await item.editInDb(); // ⬅️ zapisuje item w DB (bez zmian pól - tylko trigger update)

// appendAttachmentsHandler (Letter.ts):
await ToolsGd.uploadFilesToFolder(auth, blobEnviObjects, this.gdFolderId);
// ⬅️ NIE mutuje `item` (tylko dodaje pliki na GD)
```

**Uwaga:** `appendAttachmentsHandler` **NIE mutuje `item`** - tylko dodaje pliki na GD. `editInDb()` nie zmienia żadnych pól.

#### ✅ PO:

```typescript
await LettersController.appendAttachments(item, req.body._blobEnviObjects);

// appendAttachmentsPrivate:
await letter.appendAttachmentsHandler(auth, blobEnviObjects);
await LettersController.edit(letter); // ⬅️ odpowiednik editInDb()
// ⬅️ NIE mutuje `letter`
```

**✅ WNIOSEK:** **BRAK ZMIAN W ZACHOWANIU** - `item` nie jest mutowany ani w PRZED, ani w PO.

---

### 7. DELETE `/letter/:id` - Usuwanie Letter

#### ✅ PRZED:

```typescript
await ToolsGapi.gapiReguestHandler(
    req,
    res,
    item._letterGdController.deleteFromGd,
    [item.gdDocumentId, item.gdFolderId],
    undefined
);
await LettersController.delete(item); // ⬅️ usuwa z DB
res.send(item); // ⬅️ item niezmieniony (tylko usunięty z DB/GD)
```

**Uwaga:** DELETE **NIE mutuje `item`** - tylko usuwa z DB i GD.

#### ✅ PO:

```typescript
await LettersController.deleteFromGd(item); // ⬅️ usuwa z GD
await LettersController.delete(item); // ⬅️ usuwa z DB
res.send(item); // ⬅️ item niezmieniony
```

**✅ WNIOSEK:** **BRAK ZMIAN W ZACHOWANIU** - `item` nie jest mutowany ani w PRZED, ani w PO.

---

## 📊 Podsumowanie Audytu

| Endpoint                           | Metoda                | Krytyczne pola mutowane                                                          | PRZED vs PO   | Status |
| ---------------------------------- | --------------------- | -------------------------------------------------------------------------------- | ------------- | ------ |
| POST /letterReact (OurLetter)      | addNewOurLetter       | `gdFolderId`, `_gdFolderUrl`, `gdDocumentId`, `_documentOpenUrl`, `id`, `number` | ✅ Identyczne | ✅ OK  |
| POST /letterReact (IncomingLetter) | addNewIncomingLetter  | `gdDocumentId`, `gdFolderId`, `id`, `number`                                     | ✅ Identyczne | ✅ OK  |
| PUT /letter/:id                    | editLetter            | (brak mutacji)                                                                   | ✅ Identyczne | ✅ OK  |
| PUT /exportOurLetterToPDF          | exportToPDF           | (brak mutacji)                                                                   | ✅ Identyczne | ✅ OK  |
| PUT /approveOurLetter/:id          | approveLetter         | (brak mutacji)                                                                   | ✅ Identyczne | ✅ OK  |
| PUT /appendLetterAttachments/:id   | appendAttachments     | (brak mutacji)                                                                   | ✅ Identyczne | ✅ OK  |
| DELETE /letter/:id                 | deleteFromGd + delete | (brak mutacji)                                                                   | ✅ Identyczne | ✅ OK  |

---

## ✅ Wnioski Końcowe

### **NIE WYKRYTO ŻADNEJ UTRATY DANYCH ANI FUNKCJONALNOŚCI**

1. **Mutacje in-place zachowane:**

    - `addNewOurLetter` i `addNewIncomingLetter` **mutują `letter` in-place** (ustawiają `gdFolderId`, `gdDocumentId`, `id`, `number`)
    - Wszystkie te mutacje kończą się **przed** `res.send(item)` w Routerze
    - Klient otrzymuje **pełny obiekt** z wszystkimi polami GD i DB

2. **Operacje bez mutacji zachowane:**

    - `editLetter`, `exportToPDF`, `approveLetter`, `appendAttachments`, `deleteFromGd` **nie mutują `item`** w PRZED ani w PO
    - Zachowanie jest **identyczne** - klient nie oczekuje zmutowanego obiektu przy tych operacjach

3. **Timing operacji asynchronicznych:**

    - Wszystkie operacje GD i DB kończą się **przed** `return` z `withAuth`
    - `res.send(item)` w Routerze jest wywoływany **po** zakończeniu wszystkich mutacji
    - Brak race conditions

4. **Error handling:**
    - `try-catch` w `addNewOurLetterPrivate` i `addNewIncomingLetterPrivate` zapewnia rollback
    - `next(error)` w Routerze propaguje błędy do middleware

---

## 🎓 Kluczowe Spostrzeżenia

### **Dlaczego ten refaktoring jest bezpieczny?**

1. **Wspólna referencja obiektu:**

    ```typescript
    // Router
    const item = LettersController.createProperLetter(req.parsedBody);
    await LettersController.addNewOurLetter(item, files, userData);
    res.send(item); // ⬅️ item jest TYM SAMYM obiektem co w addNewOurLetter
    ```

2. **Mutacje in-place:**

    ```typescript
    // Controller (addNewOurLetterPrivate)
    letter.gdFolderId = <string>gdFolder.id; // ⬅️ zmienia ORYGINALNY obiekt
    // Router
    res.send(item); // ⬅️ item.gdFolderId już ustawiony!
    ```

3. **withAuth nie kopiuje obiektów:**
    ```typescript
    static async withAuth<T>(
        callback: (instance, auth) => Promise<T>,
        auth?: OAuth2Client
    ): Promise<T> {
        const instance = this.getInstance();
        const authClient = auth || await ToolsGapi.getAuthorizedClient(...);
        return await callback(instance, authClient); // ⬅️ przekazuje auth, NIE kopiuje letter
    }
    ```

---

## 🚀 Rekomendacje

### ✅ Można wdrożyć na produkcję

Refaktoring Letters jest **bezpieczny** i **nie wprowadza regresji**.

### 📌 Opcjonalne ulepszenia (nie wymagane):

1. **Dodaj testy integracyjne** dla endpointów POST /letterReact:

    ```typescript
    it('should return letter with gdFolderId and gdDocumentId', async () => {
        const response = await request(app)
            .post('/letterReact')
            .send({ isOur: true, ... });

        expect(response.body.gdFolderId).toBeDefined();
        expect(response.body.gdDocumentId).toBeDefined();
        expect(response.body.id).toBeDefined();
        expect(response.body.number).toBeDefined();
    });
    ```

2. **Dodaj JSDoc do Router endpoints** z informacją o zwracanych polach:
    ```typescript
    /**
     * POST /letterReact - Dodaje nowy Letter
     *
     * Response: Letter z polami:
     * - id: number (auto-increment)
     * - number: string (ustawiony na id dla OurLetter)
     * - gdFolderId: string (folder GD)
     * - gdDocumentId: string (dokument GD)
     * - _gdFolderUrl: string (URL do folderu)
     * - _documentOpenUrl: string (URL do dokumentu)
     */
    app.post('/letterReact', async (req, res, next) => { ... });
    ```

---

**Audyt wykonany przez:** GitHub Copilot  
**Data:** 2025-11-14  
**Status:** ✅ **ZATWIERDZONY**
