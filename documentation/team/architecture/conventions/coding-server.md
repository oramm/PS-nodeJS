# Audyt Serwera â€” PS-nodeJS

> Dokument referencyjny dla przyszĹ‚ych agentĂłw.
> Wygenerowano: 2026-02-20

---

## 1. Stack technologiczny (Quick Reference)

| Warstwa          | Technologia                              | Wersja                           |
| ---------------- | ---------------------------------------- | -------------------------------- |
| Runtime          | Node.js                                  | >=22.17.0 <25.0.0                |
| JÄ™zyk            | TypeScript                               | 5.x (strict mode)                |
| Framework        | Express.js                               | 4.18.x                           |
| Baza gĹ‚Ăłwna      | MariaDB                                  | 10.6.x (via mysql2 ^3.2.0)       |
| Sesje            | MongoDB                                  | via connect-mongo ^5.0.0         |
| Google APIs      | googleapis                               | ^144.0.0                         |
| Email (SMTP)     | nodemailer                               | ^6.9.14                          |
| Email (IMAP)     | imapflow                                 | ^1.0.169                         |
| AI               | OpenAI SDK                               | ^6.16.0                          |
| PDF parsing      | pdf-parse                                | ^2.4.5                           |
| DOCX parsing     | mammoth                                  | ^1.11.0                          |
| Fuzzy search     | fuse.js                                  | ^7.0.0                           |
| Upload           | multer                                   | ^1.4.5 (memory storage)          |
| Cron             | node-cron                                | ^4.2.1                           |
| Test runner      | Jest                                     | ^30.2.0 + ts-jest ^29.4.5        |
| Formatter        | Prettier                                 | (tabWidth: 4, singleQuote: true) |
| Linter           | Brak dedykowanego (brak ESLint config)   |
| CI/CD            | Brak (brak .github/workflows/)           |
| Pre-commit hooks | Brak (brak husky, brak aktywnych hookĂłw) |
| Deploy           | Heroku (Procfile obecny)                 |
| Package manager  | Yarn 1.22.19 (classic)                   |

**ProtokoĹ‚y komunikacji:** REST API (JSON) â€” brak WebSocket/gRPC/GraphQL.

**ZewnÄ™trzne integracje:**

- Google Drive (dokumenty, foldery)
- Google Docs (szablony dokumentĂłw)
- Google Sheets (Scrum Sheet backup)
- Google OAuth2 (autoryzacja)
- Gmail (wysyĹ‚ka email)
- IMAP (odbieranie email)
- KSeF â€” Krajowy System e-Faktur (polska administracja)
- OpenAI API (analiza profili)

---

## 2. Struktura katalogĂłw

```
PS-nodeJS/                         # Root
â”śâ”€â”€ src/                           # 332 plikĂłw TS, ~7600 LOC
â”‚   â”śâ”€â”€ index.ts                   # Entry point (241 linii) â€” Express app, CORS, session, middleware, cron
â”‚   â”śâ”€â”€ __mocks__/                 # Globalne mocki dla testĂłw
â”‚   â”śâ”€â”€ __tests__/                 # Globalne testy + setup.ts
â”‚   â”śâ”€â”€ Admin/
â”‚   â”‚   â”śâ”€â”€ Cities/                # CRUD miast (prosty wzorcowy moduĹ‚)
â”‚   â”‚   â””â”€â”€ ContractRanges/        # Zakresy kontraktĂłw
â”‚   â”śâ”€â”€ contractMeetingNotes/      # Notatki ze spotkaĹ„ kontraktowych (nowy moduĹ‚, dobrze otestowany)
â”‚   â”śâ”€â”€ contracts/                 # Kontrakty â€” NAJWIÄKSZY moduĹ‚
â”‚   â”‚   â”śâ”€â”€ contractRangesContracts/
â”‚   â”‚   â”śâ”€â”€ contractTypes/
â”‚   â”‚   â”śâ”€â”€ materialCards/
â”‚   â”‚   â”śâ”€â”€ milestones/            # Kamienie milowe
â”‚   â”‚   â”‚   â”śâ”€â”€ cases/             # Sprawy
â”‚   â”‚   â”‚   â”‚   â”śâ”€â”€ caseEvents/
â”‚   â”‚   â”‚   â”‚   â”śâ”€â”€ caseTemplates/
â”‚   â”‚   â”‚   â”‚   â”śâ”€â”€ caseTypes/
â”‚   â”‚   â”‚   â”‚   â”śâ”€â”€ risks/
â”‚   â”‚   â”‚   â”‚   â””â”€â”€ tasks/         # Zadania
â”‚   â”‚   â”‚   â”‚       â””â”€â”€ taskTemplates/
â”‚   â”‚   â”‚   â”śâ”€â”€ milestoneTemplates/
â”‚   â”‚   â”‚   â””â”€â”€ milestoneTypes/
â”‚   â”‚   â”śâ”€â”€ MilestoneTypeContractTypeAssociations/
â”‚   â”‚   â””â”€â”€ securities/            # Zabezpieczenia kontraktĂłw
â”‚   â”śâ”€â”€ controllers/
â”‚   â”‚   â””â”€â”€ BaseController.ts      # Bazowy controller (singleton, withAuth)
â”‚   â”śâ”€â”€ costInvoices/              # Faktury kosztowe (import XML/KSeF)
â”‚   â”śâ”€â”€ documentTemplates/         # Szablony dokumentĂłw GDocs
â”‚   â”śâ”€â”€ entities/                  # Podmioty gospodarcze
â”‚   â”śâ”€â”€ financialAidProgrammes/    # Programy pomocowe
â”‚   â”‚   â”śâ”€â”€ FocusAreas/
â”‚   â”‚   â”‚   â””â”€â”€ ApplicationCalls/  # Nabory wnioskĂłw
â”‚   â”‚   â”śâ”€â”€ Needs/                 # Potrzeby
â”‚   â”‚   â””â”€â”€ NeedsFocusAreas/       # Relacja potrzeby-obszary
â”‚   â”śâ”€â”€ invoices/                  # Faktury sprzedaĹĽowe + KSeF
â”‚   â”‚   â””â”€â”€ KSeF/                  # Integracja z Krajowym Systemem e-Faktur
â”‚   â”śâ”€â”€ letters/                   # Pisma (polimorficzne: Our/Incoming Ă— Contract/Offer)
â”‚   â”śâ”€â”€ meetings/                  # Spotkania
â”‚   â”‚   â””â”€â”€ meetingArrangements/
â”‚   â”śâ”€â”€ offers/                    # Oferty (OurOffer/ExternalOffer)
â”‚   â”‚   â”śâ”€â”€ OfferBond/             # Wadium
â”‚   â”‚   â””â”€â”€ OfferInvitationMails/  # Zaproszenia mailowe do ofert
â”‚   â”śâ”€â”€ persons/                   # Osoby â€” DRUGI NAJWIÄKSZY moduĹ‚
â”‚   â”‚   â”śâ”€â”€ educations/            # WyksztaĹ‚cenie
â”‚   â”‚   â”śâ”€â”€ experiences/           # DoĹ›wiadczenie zawodowe
â”‚   â”‚   â”śâ”€â”€ migrations/            # Migracje SQL (4 pliki)
â”‚   â”‚   â”śâ”€â”€ profileImport/         # Import profilu z PDF/DOCX (OpenAI)
â”‚   â”‚   â”śâ”€â”€ profileSkills/         # UmiejÄ™tnoĹ›ci profilu
â”‚   â”‚   â”śâ”€â”€ projectRoles/          # Role projektowe
â”‚   â”‚   â”śâ”€â”€ publicProfileSubmission/ # Publiczne zgĹ‚oszenia profili
â”‚   â”‚   â””â”€â”€ skills/                # SĹ‚ownik umiejÄ™tnoĹ›ci (v2 API)
â”‚   â”śâ”€â”€ processes/                 # Procesy biznesowe
â”‚   â”‚   â””â”€â”€ processInstances/
â”‚   â”śâ”€â”€ projects/                  # Projekty
â”‚   â”śâ”€â”€ repositories/
â”‚   â”‚   â””â”€â”€ BaseRepository.ts      # Bazowe repo (CRUD, makeAndConditions)
â”‚   â”śâ”€â”€ scripts/                   # Skrypty pomocnicze
â”‚   â”śâ”€â”€ ScrumSheet/                # Integracja z Google Sheets (Scrum)
â”‚   â”śâ”€â”€ setup/
â”‚   â”‚   â”śâ”€â”€ loadEnv.ts             # Ĺadowanie zmiennych Ĺ›rodowiskowych
â”‚   â”‚   â””â”€â”€ Sessions/
â”‚   â”‚       â”śâ”€â”€ ToolsGapi.ts       # Google API auth helper
â”‚   â”‚       â””â”€â”€ Gauth2Routers.ts   # OAuth2 routes (login/logout/callback)
â”‚   â”śâ”€â”€ Tests/                     # (prawdopodobnie stary katalog testowy)
â”‚   â”śâ”€â”€ tools/
â”‚   â”‚   â”śâ”€â”€ ToolsDb.ts             # DB connection pool, query, transaction
â”‚   â”‚   â”śâ”€â”€ ToolsGd.ts             # Google Drive operations
â”‚   â”‚   â”śâ”€â”€ ToolsDocs.ts           # Google Docs operations
â”‚   â”‚   â”śâ”€â”€ ToolsEmail.ts          # Email (SMTP + IMAP)
â”‚   â”‚   â”śâ”€â”€ ToolsMail.ts           # Error reporting via email
â”‚   â”‚   â””â”€â”€ ToolsSheets.ts         # Google Sheets operations
â”‚   â””â”€â”€ types/
â”‚       â”śâ”€â”€ types.d.ts             # Globalne typy TS
â”‚       â””â”€â”€ sessionTypes.ts        # Rozszerzenie typĂłw sesji Express
â”śâ”€â”€ docs/
â”‚   â”śâ”€â”€ team/                      # Dokumentacja zespoĹ‚u (18 plikĂłw, ~5400 LOC)
â”‚   â”‚   â”śâ”€â”€ README.md              # Struktura docs i polityka zmian
â”‚   â”‚   â”śâ”€â”€ onboarding/            # Ĺšrodowisko, local setup, secrets
â”‚   â”‚   â”śâ”€â”€ runbooks/              # Testing, dev-login
â”‚   â”‚   â””â”€â”€ operations/            # DB changes, deployment, postÄ™p refaktorĂłw
â”‚   â””â”€â”€ ai/                        # Docs specyficzne dla AI
â”śâ”€â”€ .github/
â”‚   â”śâ”€â”€ instructions/              # 7 plikĂłw AI instructions (~3300 LOC)
â”‚   â”śâ”€â”€ agents/                    # DB architect agent
â”‚   â””â”€â”€ PULL_REQUEST_TEMPLATE.md
â”śâ”€â”€ .agents/skills/                # 3 skills (DB snapshot, persons-v2, refactoring audit)
â”śâ”€â”€ .claude/                       # Claude Code settings
â”śâ”€â”€ maintenance/                   # Skrypty utrzymaniowe
â”śâ”€â”€ scripts/                       # Root-level scripts
â”śâ”€â”€ build/                         # Skompilowany JS (wyjĹ›cie tsc)
â””â”€â”€ tmp/                           # Pliki tymczasowe
```

### Metryki

| Metryka                    | WartoĹ›Ä‡ |
| -------------------------- | ------- |
| Pliki TypeScript (src/)    | 332     |
| Szacowane LOC (TS)         | ~7,600  |
| Pliki SQL (migracje)       | 8       |
| Pliki testowe              | 22      |
| Pliki dokumentacji (MD)    | ~44     |
| LOC dokumentacji           | ~9,200  |
| Definicje endpointĂłw REST  | ~253    |
| ModuĹ‚y domenowe            | 15      |
| Branchy git (local+remote) | 19      |

---

## 3. Architektura i wzorce

### Clean Architecture â€” warstwy

```
Router â†’ (Validator) â†’ Controller â†’ Repository â†’ Model
                                         â†“
                                  ToolsDb/ToolsGd/ToolsEmail
```

**ReguĹ‚y krytyczne (z CLAUDE.md i .github/instructions/):**

1. Flow **MUSI** byÄ‡: Router â†’ (Validator) â†’ Controller â†’ Repository â†’ Model
2. Controller zarzÄ…dza transakcjami DB (NIE Repository)
3. Model **NIE MOĹ»E** importowaÄ‡ Controller/Repository
4. Model **NIE MOĹ»E** wykonywaÄ‡ operacji I/O na bazie
5. Repository **NIE MOĹ»E** zawieraÄ‡ logiki biznesowej
6. Router **NIE MOĹ»E** tworzyÄ‡ instancji Model ani wywoĹ‚ywaÄ‡ Repository

### Wzorzec Singleton (Controller)

```typescript
export default class XxxController extends BaseController<Xxx, XxxRepository> {
    private static instance: XxxController;

    // ZAWSZE private
    private static getInstance(): XxxController {
        if (!this.instance) this.instance = new XxxController();
        return this.instance;
    }

    // Metody publiczne ZAWSZE static
    static async find(searchParams) { ... }
    static async addFromDto(dto) { ... }
}
```

### Wzorzec Transaction

```typescript
return await ToolsDb.transaction<T>(async (conn) => {
    // operacje z conn jako external connection
    await this.repository.addInDb(item, conn, true);
    return item;
});
```

### Wzorzec withAuth (Google API)

```typescript
static async addFromDto(payload) {
    return await this.withAuth(async (instance, authClient) => {
        return await instance.addWithAuth(payload, authClient);
    });
}
```

### Wzorzec Router

```typescript
app.post('/entities', async (req: Request, res: Response, next) => {
    try {
        const result = await XxxController.find(req.parsedBody.orConditions);
        res.send(result);
    } catch (error) {
        next(error); // â†’ global error handler
    }
});
```

**Uwaga:** Routes zdefiniowane bezpoĹ›rednio na obiekcie `app` (nie express.Router()).

### Wzorzec Validator

```typescript
export default class XxxValidator {
    static validateCreatePayload(payload): ValidatedPayload {
        if (!payload || typeof payload !== 'object')
            throw new Error('Payload is required');
        // walidacja pĂłl, normalizacja, fail-fast
        return normalizedPayload;
    }
}
```

### Wzorzec Repository â€” budowanie WHERE

```typescript
private makeAndConditions(searchParams: XxxSearchParams): string {
    const conditions = [];
    if (searchParams.id)
        conditions.push(`Table.Id = ${mysql.escape(searchParams.id)}`);
    // ... kolejne warunki
    return conditions.length > 0 ? conditions.join(' AND ') : '1';
}
```

Warunki OR obsĹ‚ugiwane przez `makeOrGroupsConditions()` z BaseRepository.

### Wzorzec mapRowToModel

```typescript
protected mapRowToModel(row: any): Xxx {
    return new Xxx({
        id: row.Id,
        name: row.Name,
        // DB column PascalCase â†’ model camelCase
    });
}
```

---

## 4. Konwencje kodowania

### Nazewnictwo

| Element                 | Konwencja                            | PrzykĹ‚ad                                      |
| ----------------------- | ------------------------------------ | --------------------------------------------- |
| Zmienne                 | camelCase                            | `searchParams`, `orConditions`                |
| Funkcje/metody          | camelCase                            | `addFromDto()`, `makeAndConditions()`         |
| Klasy                   | PascalCase                           | `ContractMeetingNotesController`              |
| Pliki                   | PascalCase (entity)                  | `CitiesRouters.ts`, `CityRepository.ts`       |
| Tabele DB               | PascalCase (plural)                  | `Cities`, `Contracts`, `ContractMeetingNotes` |
| Kolumny DB              | PascalCase                           | `Id`, `ContractId`, `SequenceNumber`          |
| StaĹ‚e                   | Brak dedykowanej (camelCase w Setup) | `Setup.Gd.meetingProtocolTemplateId`          |
| Typy                    | PascalCase + suffix                  | `CityData`, `CitiesSearchParams`              |
| Pliki Router            | `{Entity}Routers.ts` (plural)        | `CitiesRouters.ts`                            |
| Pliki Controller        | `{Entity}Controller.ts`              | `CitiesController.ts`                         |
| Pliki Repository        | `{Entity}Repository.ts`              | `CityRepository.ts`                           |
| Pliki Model             | `{Entity}.ts`                        | `City.ts`                                     |
| Pliki Validator         | `{Entity}Validator.ts`               | `InvoiceValidator.ts`                         |
| Pliki testowe           | `{Entity}.test.ts`                   | `ContractMeetingNotesController.test.ts`      |
| Pola relacyjne (nie-DB) | `_` prefix                           | `_contract`, `_createdBy`, `_items`           |

### CRUD Methods (standardowe)

| Cel                    | Metoda                                      | NIE uĹĽywaÄ‡            |
| ---------------------- | ------------------------------------------- | --------------------- |
| Szukanie               | `find()`                                    | ~~getList()~~         |
| Tworzenie z DTO        | `addFromDto()`                              | ~~addNew()~~          |
| Tworzenie (wewnÄ™trzne) | `add()`                                     | ~~create()~~          |
| Edycja z DTO           | `editFromDto()`                             | â€”                     |
| Edycja (wewnÄ™trzna)    | `edit()`                                    | ~~update()~~          |
| Usuwanie               | `delete()`                                  | â€”                     |
| Zapis do DB            | `addInDb()`, `editInDb()`, `deleteFromDb()` | ~~instance.create()~~ |

### Importy

```typescript
// 1. ModuĹ‚y zewnÄ™trzne
import express, { Request, Response } from 'express';
import mysql from 'mysql2/promise';

// 2. Bazowe klasy
import BaseController from '../../controllers/BaseController';

// 3. Lokalne moduĹ‚y
import City from './City';
import CityRepository, { CitiesSearchParams } from './CityRepository';
```

### Komentarze

- **JÄ™zyk**: polski (w komentarzach logiki) + angielski (w kodzie)
- **GÄ™stoĹ›Ä‡**: niska â€” komentarze rzadkie, kod ma byÄ‡ samodokumentujÄ…cy
- **Komunikaty bĹ‚Ä™dĂłw**: po polsku (user-facing), po angielsku (techniczne)
- **Console.log**: polskie etykiety: `"WystÄ…piĹ‚ bĹ‚Ä…d:"`, `"Uruchamianie zaplanowanego zadania..."`

### Styl kodu

- **Tabwidth**: 4 spacje
- **CudzysĹ‚owy**: single quotes (`'...'`)
- **Ĺšredniki**: tak, zawsze
- **Trailing comma**: tak (w obiektach i argumentach)
- **Typowa dĹ‚ugoĹ›Ä‡ funkcji**: 10-40 linii
- **Eksporty**: `export default class` (jeden gĹ‚Ăłwny per plik) + `export type` (typy)

---

## 5. Stan testĂłw i narzÄ™dzi jakoĹ›ci

### Testy

| Aspekt           | Stan                                                    |
| ---------------- | ------------------------------------------------------- |
| Framework        | Jest 30.2.0 + ts-jest                                   |
| PlikĂłw testowych | 22                                                      |
| Lokalizacja      | `src/{module}/__tests__/*.test.ts`                      |
| Setup globalny   | `src/__tests__/setup.ts`                                |
| Config           | `jest.config.js` (pattern: `**/__tests__/**/*.test.ts`) |

**Pokrycie moduĹ‚Ăłw testami:**

- contractMeetingNotes: 4 testy (Router, Controller, Repository, Validator) â€” **najlepiej pokryty**
- contracts: 1 test (Controller.add)
- costInvoices: 1 test (xmlHelpers)
- invoices/KSeF: 1 test (KsefService)
- offers: 3 testy (Controller integration, Controller unit, OurOffer model)
- persons: 8 testĂłw (Repository, Controller, Routers â€” wiele wariantĂłw)
- persons/educations: 1 test
- persons/profileSkills: 2 testy
- persons/publicProfileSubmission: 1 test
- persons/skills: 1 test
- setup/Sessions: 1 test (ToolsGapi)

**Wzorzec testowy:**

- Mockowanie: ToolsDb.transaction, withAuth, ToolsGd._, ToolsMail._
- Reset singleton w beforeEach: `(Controller as any).instance = undefined`
- Assert: `expect(...).toHaveBeenCalledWith(expect.objectContaining({...}))`

### NarzÄ™dzia jakoĹ›ci

| NarzÄ™dzie             | Stan                            | Uwagi                           |
| --------------------- | ------------------------------- | ------------------------------- |
| Prettier              | Skonfigurowany (w package.json) | tabWidth: 4, singleQuote: true  |
| ESLint                | **BRAK**                        | Brak konfiguracji eslint        |
| TSC strict            | WĹ‚Ä…czony                        | tsconfig.json: `"strict": true` |
| Circular deps checker | Tak                             | `yarn check:cycles` (madge)     |
| Pre-commit hooks      | **BRAK**                        | Brak husky/lint-staged          |
| CI/CD                 | **BRAK**                        | Brak .github/workflows/         |
| Coverage              | Skonfigurowany                  | text + lcov + html reporters    |

### Pytania do wyjaĹ›nienia

- Czy `src/Tests/` (PascalCase) to stary katalog? Jest w `.gitignore` â€” prawdopodobnie legacy.
- Coverage % â€” nie uruchamiaĹ‚em `yarn test:coverage` (wymaga DB i env).

---

## 6. API Surface (endpointy)

### Statystyki

| Metoda HTTP | IloĹ›Ä‡                |
| ----------- | -------------------- |
| POST        | ~120 (find + create) |
| PUT         | ~60 (update)         |
| DELETE      | ~40                  |
| GET         | ~30                  |
| PATCH       | ~3 (costInvoices)    |
| **RAZEM**   | **~253**             |

### Format danych

- **Request**: JSON (via `express.json()`, 10MB limit)
- **Response**: JSON (via `res.send()`)
- **File upload**: multipart/form-data (multer, memory storage)
- **Konwencja find**: `POST /{entities}` z body `{ orConditions: [...] }`
- **Konwencja CRUD**: `POST /{entity}`, `PUT /{entity}/:id`, `DELETE /{entity}/:id`

### Mapa endpointĂłw wedĹ‚ug moduĹ‚u

#### Auth & Session

| Endpoint                     | Metoda | Opis                        |
| ---------------------------- | ------ | --------------------------- |
| `/login`                     | POST   | Google OAuth login          |
| `/logout`                    | POST   | Wylogowanie                 |
| `/session`                   | GET    | Status sesji                |
| `/sessionTaskStatus/:taskId` | GET    | Status zadania w sesji      |
| `/get-token`                 | POST   | Uzyskanie tokenu OAuth      |
| `/oauthcallback`             | GET    | Google OAuth callback       |
| `/client-error`              | POST   | Raportowanie bĹ‚Ä™dĂłw klienta |

#### Admin

| Endpoint          | Metoda          | Opis                       |
| ----------------- | --------------- | -------------------------- |
| `/cities`         | POST            | Szukaj miast               |
| `/city`           | POST/PUT/DELETE | CRUD miasto                |
| `/contractRanges` | POST            | Szukaj zakresĂłw kontraktĂłw |
| `/contractRange`  | POST/PUT/DELETE | CRUD zakres kontraktĂłw     |

#### Contracts (rozbudowany)

| Prefix                                      | Encje                     |
| ------------------------------------------- | ------------------------- |
| `/contracts`, `/contract`                   | Kontrakty gĹ‚Ăłwne          |
| `/milestones`, `/milestone`                 | Kamienie milowe           |
| `/milestoneDates`, `/milestoneDate`         | Daty kamieni milowych     |
| `/milestoneTypes`, `/milestoneType`         | Typy kamieni milowych     |
| `/milestoneTemplates`, `/milestoneTemplate` | Szablony kamieni milowych |
| `/cases`, `/case`                           | Sprawy                    |
| `/caseTypes`, `/caseType`                   | Typy spraw                |
| `/caseTemplates`, `/caseTemplate`           | Szablony spraw            |
| `/caseEvents`                               | Zdarzenia spraw (GET)     |
| `/tasks`, `/task`                           | Zadania                   |
| `/taskTemplates`, `/taskTemplate`           | Szablony zadaĹ„            |
| `/risks`                                    | Ryzyka (GET)              |
| `/risksReactions`                           | Reakcje na ryzyka (GET)   |
| `/securities`, `/security`                  | Zabezpieczenia            |
| `/materialCards`, `/materialCard`           | Karty materiaĹ‚owe (GET)   |
| `/contractTypes`, `/contractType`           | Typy kontraktĂłw           |

#### Invoices & KSeF

| Endpoint                           | Metoda          | Opis                   |
| ---------------------------------- | --------------- | ---------------------- |
| `/invoices`                        | POST            | Szukaj faktur          |
| `/invoice`                         | POST/PUT/DELETE | CRUD faktura           |
| `/invoice/:id/ksef/send`           | POST            | WyĹ›lij do KSeF         |
| `/invoice/:id/ksef/status`         | GET             | Status KSeF            |
| `/invoice/:id/ksef/upo`            | GET             | Pobierz UPO            |
| `/invoice/:id/ksef/xml`            | GET             | Pobierz XML            |
| `/invoice/:id/correction`          | POST            | Korekta faktury        |
| `/invoice/:id/ksef/correction`     | POST            | Korekta KSeF           |
| `/invoiceItems`, `/invoiceItem`    | POST/PUT/DELETE | CRUD pozycje faktury   |
| `/copyInvoice`, `/copyInvoiceItem` | POST            | Kopiuj fakturÄ™/pozycjÄ™ |
| `/setAsSentInvoice/:id`            | PUT             | Oznacz jako wysĹ‚anÄ…    |
| `/setAsPaidInvoice/:id`            | PUT             | Oznacz jako opĹ‚aconÄ…   |

#### Cost Invoices (faktury kosztowe)

| Prefix            | Operacje                           |
| ----------------- | ---------------------------------- |
| `/costInvoices/*` | CRUD, import XML, podglÄ…d, statusy |

#### Letters (pisma)

| Endpoint                                                        | Metoda   | Opis                |
| --------------------------------------------------------------- | -------- | ------------------- |
| `/contractsLetters`, `/offersLetters`                           | POST     | Szukaj pism         |
| `/letter` (contractOur/contractIncoming/offerOur/offerIncoming) | POST/PUT | CRUD pisma          |
| `/exportOurLetterToPDF`                                         | PUT      | Eksport do PDF      |
| `/approveOurLetter/:id`                                         | PUT      | Zatwierdzenie pisma |
| `/autoApproveOurLetters`                                        | GET      | Auto-zatwierdzanie  |

#### Offers

| Endpoint                            | Metoda          | Opis                |
| ----------------------------------- | --------------- | ------------------- |
| `/offers`                           | POST            | Szukaj ofert        |
| `/offer`                            | POST/PUT/DELETE | CRUD oferta         |
| `/sendOffer/:id`                    | PUT             | WyĹ›lij ofertÄ™       |
| `/exportOurOfferToPDF`              | PUT             | Eksport do PDF      |
| `/offerBonds`, `/offerBond`         | POST/DELETE     | Wadium              |
| `/mailsToCheck`, `/mailInvitations` | POST/PUT/DELETE | Zaproszenia mailowe |

#### Persons (rozbudowany)

| Prefix                       | Encje                              |
| ---------------------------- | ---------------------------------- |
| `/persons`, `/person`        | Osoby                              |
| `/user`                      | UĹĽytkownik systemu                 |
| `/systemUser`                | Tworzenie uĹĽytkownika              |
| `/v2/skills`                 | SĹ‚ownik umiejÄ™tnoĹ›ci (v2 API)      |
| `/educations/*`              | WyksztaĹ‚cenie (CRUD)               |
| `/experiences/*`             | DoĹ›wiadczenie (CRUD)               |
| `/profileSkills/*`           | UmiejÄ™tnoĹ›ci profilu               |
| `/profileImport/*`           | Import profilu (analyze + confirm) |
| `/publicProfileSubmission/*` | Publiczne zgĹ‚oszenia profili       |

#### Other

| Prefix                                          | ModuĹ‚                    |
| ----------------------------------------------- | ------------------------ |
| `/entities`, `/entity`                          | Podmioty                 |
| `/projects`, `/project`                         | Projekty                 |
| `/financialAidProgrammes`                       | Programy pomocowe        |
| `/focusAreas`, `/focusArea`                     | Obszary zainteresowania  |
| `/applicationCalls`, `/applicationCall`         | Nabory wnioskĂłw          |
| `/needs`, `/need`                               | Potrzeby                 |
| `/needsFocusAreas`, `/needFocusArea`            | Relacja potrzeby-obszary |
| `/documentTemplates`, `/documentTemplate`       | Szablony dokumentĂłw      |
| `/meetings`, `/meetingArrangements`             | Spotkania (GET only)     |
| `/processes`, `/processSteps`                   | Procesy biznesowe        |
| `/processInstances`, `/processStepInstances`    | Instancje procesĂłw (GET) |
| `/contractMeetingNotes`, `/contractMeetingNote` | Notatki ze spotkaĹ„       |
| `/scrumSheet/*`                                 | Scrum Sheet (GET only)   |

### CORS

```typescript
origin: [
    'http://localhost',
    'http://localhost:9000',
    'https://erp-envi.herokuapp.com',
    'https://erp.envi.com.pl',
    'https://ps.envi.com.pl',
],
credentials: true
```

### Autentykacja

- **Mechanizm**: express-session + MongoDB store + Google OAuth2
- **Cookie**: `connect.sid`, httpOnly, secure (production), sameSite=none (production)/lax (dev)
- **Session data**: `req.session.userData` (userName, systemRoleName, enviId)
- **TTL**: 24 godziny
- **Uwaga**: Brak middleware auth guard â€” prawdopodobnie sprawdzanie sesji w poszczegĂłlnych routerach lub na kliencie

### Middleware (kolejnoĹ›Ä‡ w index.ts)

1. `cors(corsOptions)`
2. `express.json({ limit: '10mb' })`
3. `multer({ storage: memoryStorage() })`
4. `session({ store: MongoStore })`
5. Session logger (console.log)
6. Body parser (`req.parsedBody` / `req.parsedQuery`)
7. Routers (require)
8. Global error handler â†’ `ToolsMail.sendServerErrorReport()`

---

## 7. Git

### Ostatnie 20 commitĂłw

```
b24ca60 oznaczenie modelu i tekenĂłw - import pisma
1353d2b Add person profile import (analyze + import-confirm)
28f2977 Update settings.local.json
4a93db3 Add skills description & KSeF sale/due-date fix
3cb40da Update settings.local.json
b349951 Add KSeF token check script and lazy env getter
4656e58 Add KSeF token selection, OpenAI key and env docs
a3e0e99 poprawka
de5d299 poprawka statusy faktur kosztowych
3af0ad7 Extract profile experiences to dedicated module
fde9c16 Update post-change-checklist.md
df1a20e Update settings.local.json
13097e5 Merge branch 'feature-contract-notes'
f3ee730 Merge branch 'persons-v2'
ebd4b9c Add v2 search endpoints and repo search support
4e6fa8c Move DTO validation to controller; add tests/docs
f6d1232 Add migration runner and document DB gate closure
1c7f1dc Add meetingId, read endpoint, migration update
239c0b4 Add contract meeting notes create endpoint
1926f8b Add Contract Meeting Notes backend data layer
```

### Format commitĂłw

- **Mieszany**: czÄ™Ĺ›Ä‡ angielski, czÄ™Ĺ›Ä‡ polski
- **Brak Conventional Commits** (brak prefix fix:/feat:/chore: itp.) â€” wyjÄ…tkiem sÄ… commity generowane przez AI (np. "Add person profile import...")
- Polskie commity to szybkie poprawki: "poprawka", "oznaczenie modelu i tekenĂłw"
- Angielskie commity to feature-level opisy

### Branching

- **Main branch**: `main`
- **Feature branches**: `feature-contract-notes`, `persons-v2`, `KSeF`, `AI-API`
- **Refactoring branches**: `MVC-refactoring`, `refactoring-MVC-testy`
- **Inne**: `react`, `historia-sprawdzenie`
- **Strategy**: feature branch â†’ merge to main (brak PR workflow widocznego)

---

## 8. Dokumentacja â€” inwentarz

### Root-level MD (pliki-skrĂłty)

| Plik                     | TreĹ›Ä‡                                            |
| ------------------------ | ------------------------------------------------ |
| `CLAUDE.md`              | 327 linii â€” gĹ‚Ăłwny plik instrukcji dla AI        |
| `AGENTS.md`              | ReguĹ‚y agentĂłw + linki do kanonicznych docs      |

### documentation/team/ (kanoniczne)

| ĹšcieĹĽka                                              | Linii | Opis                                    |
| ---------------------------------------------------- | ----- | --------------------------------------- |
| `README.md`                                          | 34    | Struktura dokumentacji i polityka zmian |
| `onboarding/environment.md`                          | 72    | Konfiguracja Ĺ›rodowiska                 |
| `onboarding/local-setup.md`                          | 28    | Setup lokalny                           |
| `onboarding/access-and-secrets.md`                   | 28    | DostÄ™py i sekrety                       |
| `runbooks/testing.md`                                | 55    | Framework testowy                       |
| `runbooks/dev-login.md`                              | 60    | Dev login setup                         |
| `operations/db-changes.md`                           | 50    | Workflow zmian DB                       |
| `operations/deployment-heroku.md`                    | 43    | Procedura deploy                        |
| `operations/post-change-checklist.md`                | 1,211 | Checklista post-zmianowa                |
| `operations/persons-v2-refactor/plan.md`             | 293   | Plan refaktoru persons v2               |
| `operations/persons-v2-refactor/progress.md`         | 1,596 | PostÄ™p refaktoru                        |
| `operations/persons-v2-refactor/activity-log.md`     | 0     | Log aktywnoĹ›ci refaktoru                |
| `operations/contract-meeting-notes/plan.md`          | 181   | Plan notatek ze spotkaĹ„                 |
| `operations/contract-meeting-notes/progress.md`      | 670   | PostÄ™p notatek                          |
| `operations/contract-meeting-notes/activity-log.md`  | 210   | Log aktywnoĹ›ci notatek                  |
| `operations/hr-module/plan.md`                       | 378   | Plan moduĹ‚u HR                          |
| `operations/hr-module/progress.md`                   | 161   | PostÄ™p HR                               |
| `operations/hr-module/activity-log.md`               | 0     | Log aktywnoĹ›ci HR                       |
| `operations/profile-import/plan.md`                  | 0     | Plan importu profili                    |
| `operations/profile-import/progress.md`              | 270   | PostÄ™p importu profili                  |
| `operations/profile-import/activity-log.md`          | 0     | Log aktywnoĹ›ci importu profili          |
| `operations/documentation-migration/plan.md`         | 0     | Plan migracji dokumentacji              |
| `operations/documentation-migration/progress.md`     | 0     | PostÄ™p migracji dokumentacji            |
| `operations/documentation-migration/activity-log.md` | 0     | Log aktywnoĹ›ci migracji dokumentacji    |

### .github/instructions/ (instrukcje AI)

| Plik                                | Linii | Opis                                  |
| ----------------------------------- | ----- | ------------------------------------- |
| `architektura.instructions.md`      | 536   | ReguĹ‚y Clean Architecture (KRYTYCZNY) |
| `architektura-ai-assistant.md`      | 481   | Drzewa decyzyjne dla AI               |
| `architektura-szczegoly.md`         | 805   | SzczegĂłĹ‚owe przykĹ‚ady                 |
| `architektura-testowanie.md`        | 363   | Wytyczne testowe per warstwa          |
| `architektura-refactoring-audit.md` | 583   | Checklista audytu refaktoru           |
| `refactoring-auth-pattern.md`       | 492   | Migracja wzorca OAuth2 withAuth       |
| `srodowiska.instructions.md`        | 28    | Instrukcje Ĺ›rodowiskowe               |

### .agents/skills/

| Plik                            | Opis                            |
| ------------------------------- | ------------------------------- |
| `db-schema-snapshot-mariadb.md` | Procedura snapshotu schematu DB |
| `persons-v2-migration.md`       | Migracja persons v2             |
| `refactoring-audit.md`          | Audyt refaktoringu              |

---

## 9. Pytania do wyjaĹ›nienia

1. **`src/Tests/` vs `__tests__`** â€” `src/Tests/` jest w `.gitignore`. Czy to stary katalog? Czy `__tests__/` w moduĹ‚ach to nowa konwencja?
2. **Brak ESLint** â€” Ĺ›wiadoma decyzja czy przeoczenie? TSC strict + Prettier mogÄ… wystarczaÄ‡.
3. **Brak CI/CD** â€” deploy manualny na Heroku? Czy jest jakiĹ› zewnÄ™trzny pipeline?
4. **Brak auth middleware** â€” czy sesja jest sprawdzana per-router, czy klient decyduje o dostÄ™pie?
5. **OpenAI SDK** w zaleĹĽnoĹ›ciach â€” uĹĽywany w `profileImport/`. Czy planowane rozszerzenie?
6. **`maintenance/`** â€” co zawiera? Skrypty jednorazowe?
7. **Session secret hardcoded** w kodzie (`'your-random-secret-19890913007'`) â€” czy to dev-only?
