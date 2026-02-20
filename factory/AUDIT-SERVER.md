# Audyt Serwera — PS-nodeJS

> Dokument referencyjny dla przyszłych agentów.
> Wygenerowano: 2026-02-20

---

## 1. Stack technologiczny (Quick Reference)

| Warstwa | Technologia | Wersja |
|---------|------------|--------|
| Runtime | Node.js | >=22.17.0 <25.0.0 |
| Język | TypeScript | 5.x (strict mode) |
| Framework | Express.js | 4.18.x |
| Baza główna | MariaDB | 10.6.x (via mysql2 ^3.2.0) |
| Sesje | MongoDB | via connect-mongo ^5.0.0 |
| Google APIs | googleapis | ^144.0.0 |
| Email (SMTP) | nodemailer | ^6.9.14 |
| Email (IMAP) | imapflow | ^1.0.169 |
| AI | OpenAI SDK | ^6.16.0 |
| PDF parsing | pdf-parse | ^2.4.5 |
| DOCX parsing | mammoth | ^1.11.0 |
| Fuzzy search | fuse.js | ^7.0.0 |
| Upload | multer | ^1.4.5 (memory storage) |
| Cron | node-cron | ^4.2.1 |
| Test runner | Jest | ^30.2.0 + ts-jest ^29.4.5 |
| Formatter | Prettier | (tabWidth: 4, singleQuote: true) |
| Linter | Brak dedykowanego (brak ESLint config) |
| CI/CD | Brak (brak .github/workflows/) |
| Pre-commit hooks | Brak (brak husky, brak aktywnych hooków) |
| Deploy | Heroku (Procfile obecny) |
| Package manager | Yarn 1.22.19 (classic) |

**Protokoły komunikacji:** REST API (JSON) — brak WebSocket/gRPC/GraphQL.

**Zewnętrzne integracje:**
- Google Drive (dokumenty, foldery)
- Google Docs (szablony dokumentów)
- Google Sheets (Scrum Sheet backup)
- Google OAuth2 (autoryzacja)
- Gmail (wysyłka email)
- IMAP (odbieranie email)
- KSeF — Krajowy System e-Faktur (polska administracja)
- OpenAI API (analiza profili)

---

## 2. Struktura katalogów

```
PS-nodeJS/                         # Root
├── src/                           # 332 plików TS, ~7600 LOC
│   ├── index.ts                   # Entry point (241 linii) — Express app, CORS, session, middleware, cron
│   ├── __mocks__/                 # Globalne mocki dla testów
│   ├── __tests__/                 # Globalne testy + setup.ts
│   ├── Admin/
│   │   ├── Cities/                # CRUD miast (prosty wzorcowy moduł)
│   │   └── ContractRanges/        # Zakresy kontraktów
│   ├── contractMeetingNotes/      # Notatki ze spotkań kontraktowych (nowy moduł, dobrze otestowany)
│   ├── contracts/                 # Kontrakty — NAJWIĘKSZY moduł
│   │   ├── contractRangesContracts/
│   │   ├── contractTypes/
│   │   ├── materialCards/
│   │   ├── milestones/            # Kamienie milowe
│   │   │   ├── cases/             # Sprawy
│   │   │   │   ├── caseEvents/
│   │   │   │   ├── caseTemplates/
│   │   │   │   ├── caseTypes/
│   │   │   │   ├── risks/
│   │   │   │   └── tasks/         # Zadania
│   │   │   │       └── taskTemplates/
│   │   │   ├── milestoneTemplates/
│   │   │   └── milestoneTypes/
│   │   ├── MilestoneTypeContractTypeAssociations/
│   │   └── securities/            # Zabezpieczenia kontraktów
│   ├── controllers/
│   │   └── BaseController.ts      # Bazowy controller (singleton, withAuth)
│   ├── costInvoices/              # Faktury kosztowe (import XML/KSeF)
│   ├── documentTemplates/         # Szablony dokumentów GDocs
│   ├── entities/                  # Podmioty gospodarcze
│   ├── financialAidProgrammes/    # Programy pomocowe
│   │   ├── FocusAreas/
│   │   │   └── ApplicationCalls/  # Nabory wniosków
│   │   ├── Needs/                 # Potrzeby
│   │   └── NeedsFocusAreas/       # Relacja potrzeby-obszary
│   ├── invoices/                  # Faktury sprzedażowe + KSeF
│   │   └── KSeF/                  # Integracja z Krajowym Systemem e-Faktur
│   ├── letters/                   # Pisma (polimorficzne: Our/Incoming × Contract/Offer)
│   ├── meetings/                  # Spotkania
│   │   └── meetingArrangements/
│   ├── offers/                    # Oferty (OurOffer/ExternalOffer)
│   │   ├── OfferBond/             # Wadium
│   │   └── OfferInvitationMails/  # Zaproszenia mailowe do ofert
│   ├── persons/                   # Osoby — DRUGI NAJWIĘKSZY moduł
│   │   ├── educations/            # Wykształcenie
│   │   ├── experiences/           # Doświadczenie zawodowe
│   │   ├── migrations/            # Migracje SQL (4 pliki)
│   │   ├── profileImport/         # Import profilu z PDF/DOCX (OpenAI)
│   │   ├── profileSkills/         # Umiejętności profilu
│   │   ├── projectRoles/          # Role projektowe
│   │   ├── publicProfileSubmission/ # Publiczne zgłoszenia profili
│   │   └── skills/                # Słownik umiejętności (v2 API)
│   ├── processes/                 # Procesy biznesowe
│   │   └── processInstances/
│   ├── projects/                  # Projekty
│   ├── repositories/
│   │   └── BaseRepository.ts      # Bazowe repo (CRUD, makeAndConditions)
│   ├── scripts/                   # Skrypty pomocnicze
│   ├── ScrumSheet/                # Integracja z Google Sheets (Scrum)
│   ├── setup/
│   │   ├── loadEnv.ts             # Ładowanie zmiennych środowiskowych
│   │   └── Sessions/
│   │       ├── ToolsGapi.ts       # Google API auth helper
│   │       └── Gauth2Routers.ts   # OAuth2 routes (login/logout/callback)
│   ├── Tests/                     # (prawdopodobnie stary katalog testowy)
│   ├── tools/
│   │   ├── ToolsDb.ts             # DB connection pool, query, transaction
│   │   ├── ToolsGd.ts             # Google Drive operations
│   │   ├── ToolsDocs.ts           # Google Docs operations
│   │   ├── ToolsEmail.ts          # Email (SMTP + IMAP)
│   │   ├── ToolsMail.ts           # Error reporting via email
│   │   └── ToolsSheets.ts         # Google Sheets operations
│   └── types/
│       ├── types.d.ts             # Globalne typy TS
│       └── sessionTypes.ts        # Rozszerzenie typów sesji Express
├── docs/
│   ├── team/                      # Dokumentacja zespołu (18 plików, ~5400 LOC)
│   │   ├── README.md              # Struktura docs i polityka zmian
│   │   ├── onboarding/            # Środowisko, local setup, secrets
│   │   ├── runbooks/              # Testing, dev-login
│   │   └── operations/            # DB changes, deployment, postęp refaktorów
│   └── ai/                        # Docs specyficzne dla AI
├── .github/
│   ├── instructions/              # 7 plików AI instructions (~3300 LOC)
│   ├── agents/                    # DB architect agent
│   └── PULL_REQUEST_TEMPLATE.md
├── .agents/skills/                # 3 skills (DB snapshot, persons-v2, refactoring audit)
├── .claude/                       # Claude Code settings
├── maintenance/                   # Skrypty utrzymaniowe
├── scripts/                       # Root-level scripts
├── build/                         # Skompilowany JS (wyjście tsc)
└── tmp/                           # Pliki tymczasowe
```

### Metryki

| Metryka | Wartość |
|---------|--------|
| Pliki TypeScript (src/) | 332 |
| Szacowane LOC (TS) | ~7,600 |
| Pliki SQL (migracje) | 8 |
| Pliki testowe | 22 |
| Pliki dokumentacji (MD) | ~44 |
| LOC dokumentacji | ~9,200 |
| Definicje endpointów REST | ~253 |
| Moduły domenowe | 15 |
| Branchy git (local+remote) | 19 |

---

## 3. Architektura i wzorce

### Clean Architecture — warstwy

```
Router → (Validator) → Controller → Repository → Model
                                         ↓
                                  ToolsDb/ToolsGd/ToolsEmail
```

**Reguły krytyczne (z CLAUDE.md i .github/instructions/):**
1. Flow **MUSI** być: Router → (Validator) → Controller → Repository → Model
2. Controller zarządza transakcjami DB (NIE Repository)
3. Model **NIE MOŻE** importować Controller/Repository
4. Model **NIE MOŻE** wykonywać operacji I/O na bazie
5. Repository **NIE MOŻE** zawierać logiki biznesowej
6. Router **NIE MOŻE** tworzyć instancji Model ani wywoływać Repository

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
        next(error);  // → global error handler
    }
});
```

**Uwaga:** Routes zdefiniowane bezpośrednio na obiekcie `app` (nie express.Router()).

### Wzorzec Validator

```typescript
export default class XxxValidator {
    static validateCreatePayload(payload): ValidatedPayload {
        if (!payload || typeof payload !== 'object')
            throw new Error('Payload is required');
        // walidacja pól, normalizacja, fail-fast
        return normalizedPayload;
    }
}
```

### Wzorzec Repository — budowanie WHERE

```typescript
private makeAndConditions(searchParams: XxxSearchParams): string {
    const conditions = [];
    if (searchParams.id)
        conditions.push(`Table.Id = ${mysql.escape(searchParams.id)}`);
    // ... kolejne warunki
    return conditions.length > 0 ? conditions.join(' AND ') : '1';
}
```

Warunki OR obsługiwane przez `makeOrGroupsConditions()` z BaseRepository.

### Wzorzec mapRowToModel

```typescript
protected mapRowToModel(row: any): Xxx {
    return new Xxx({
        id: row.Id,
        name: row.Name,
        // DB column PascalCase → model camelCase
    });
}
```

---

## 4. Konwencje kodowania

### Nazewnictwo

| Element | Konwencja | Przykład |
|---------|-----------|---------|
| Zmienne | camelCase | `searchParams`, `orConditions` |
| Funkcje/metody | camelCase | `addFromDto()`, `makeAndConditions()` |
| Klasy | PascalCase | `ContractMeetingNotesController` |
| Pliki | PascalCase (entity) | `CitiesRouters.ts`, `CityRepository.ts` |
| Tabele DB | PascalCase (plural) | `Cities`, `Contracts`, `ContractMeetingNotes` |
| Kolumny DB | PascalCase | `Id`, `ContractId`, `SequenceNumber` |
| Stałe | Brak dedykowanej (camelCase w Setup) | `Setup.Gd.meetingProtocolTemplateId` |
| Typy | PascalCase + suffix | `CityData`, `CitiesSearchParams` |
| Pliki Router | `{Entity}Routers.ts` (plural) | `CitiesRouters.ts` |
| Pliki Controller | `{Entity}Controller.ts` | `CitiesController.ts` |
| Pliki Repository | `{Entity}Repository.ts` | `CityRepository.ts` |
| Pliki Model | `{Entity}.ts` | `City.ts` |
| Pliki Validator | `{Entity}Validator.ts` | `InvoiceValidator.ts` |
| Pliki testowe | `{Entity}.test.ts` | `ContractMeetingNotesController.test.ts` |
| Pola relacyjne (nie-DB) | `_` prefix | `_contract`, `_createdBy`, `_items` |

### CRUD Methods (standardowe)

| Cel | Metoda | NIE używać |
|-----|--------|-----------|
| Szukanie | `find()` | ~~getList()~~ |
| Tworzenie z DTO | `addFromDto()` | ~~addNew()~~ |
| Tworzenie (wewnętrzne) | `add()` | ~~create()~~ |
| Edycja z DTO | `editFromDto()` | — |
| Edycja (wewnętrzna) | `edit()` | ~~update()~~ |
| Usuwanie | `delete()` | — |
| Zapis do DB | `addInDb()`, `editInDb()`, `deleteFromDb()` | ~~instance.create()~~ |

### Importy

```typescript
// 1. Moduły zewnętrzne
import express, { Request, Response } from 'express';
import mysql from 'mysql2/promise';

// 2. Bazowe klasy
import BaseController from '../../controllers/BaseController';

// 3. Lokalne moduły
import City from './City';
import CityRepository, { CitiesSearchParams } from './CityRepository';
```

### Komentarze
- **Język**: polski (w komentarzach logiki) + angielski (w kodzie)
- **Gęstość**: niska — komentarze rzadkie, kod ma być samodokumentujący
- **Komunikaty błędów**: po polsku (user-facing), po angielsku (techniczne)
- **Console.log**: polskie etykiety: `"Wystąpił błąd:"`, `"Uruchamianie zaplanowanego zadania..."`

### Styl kodu
- **Tabwidth**: 4 spacje
- **Cudzysłowy**: single quotes (`'...'`)
- **Średniki**: tak, zawsze
- **Trailing comma**: tak (w obiektach i argumentach)
- **Typowa długość funkcji**: 10-40 linii
- **Eksporty**: `export default class` (jeden główny per plik) + `export type` (typy)

---

## 5. Stan testów i narzędzi jakości

### Testy

| Aspekt | Stan |
|--------|------|
| Framework | Jest 30.2.0 + ts-jest |
| Plików testowych | 22 |
| Lokalizacja | `src/{module}/__tests__/*.test.ts` |
| Setup globalny | `src/__tests__/setup.ts` |
| Config | `jest.config.js` (pattern: `**/__tests__/**/*.test.ts`) |

**Pokrycie modułów testami:**
- contractMeetingNotes: 4 testy (Router, Controller, Repository, Validator) — **najlepiej pokryty**
- contracts: 1 test (Controller.add)
- costInvoices: 1 test (xmlHelpers)
- invoices/KSeF: 1 test (KsefService)
- offers: 3 testy (Controller integration, Controller unit, OurOffer model)
- persons: 8 testów (Repository, Controller, Routers — wiele wariantów)
- persons/educations: 1 test
- persons/profileSkills: 2 testy
- persons/publicProfileSubmission: 1 test
- persons/skills: 1 test
- setup/Sessions: 1 test (ToolsGapi)

**Wzorzec testowy:**
- Mockowanie: ToolsDb.transaction, withAuth, ToolsGd.*, ToolsMail.*
- Reset singleton w beforeEach: `(Controller as any).instance = undefined`
- Assert: `expect(...).toHaveBeenCalledWith(expect.objectContaining({...}))`

### Narzędzia jakości

| Narzędzie | Stan | Uwagi |
|-----------|------|-------|
| Prettier | Skonfigurowany (w package.json) | tabWidth: 4, singleQuote: true |
| ESLint | **BRAK** | Brak konfiguracji eslint |
| TSC strict | Włączony | tsconfig.json: `"strict": true` |
| Circular deps checker | Tak | `yarn check:cycles` (madge) |
| Pre-commit hooks | **BRAK** | Brak husky/lint-staged |
| CI/CD | **BRAK** | Brak .github/workflows/ |
| Coverage | Skonfigurowany | text + lcov + html reporters |

### Pytania do wyjaśnienia
- Czy `src/Tests/` (PascalCase) to stary katalog? Jest w `.gitignore` — prawdopodobnie legacy.
- Coverage % — nie uruchamiałem `yarn test:coverage` (wymaga DB i env).

---

## 6. API Surface (endpointy)

### Statystyki

| Metoda HTTP | Ilość |
|-------------|-------|
| POST | ~120 (find + create) |
| PUT | ~60 (update) |
| DELETE | ~40 |
| GET | ~30 |
| PATCH | ~3 (costInvoices) |
| **RAZEM** | **~253** |

### Format danych
- **Request**: JSON (via `express.json()`, 10MB limit)
- **Response**: JSON (via `res.send()`)
- **File upload**: multipart/form-data (multer, memory storage)
- **Konwencja find**: `POST /{entities}` z body `{ orConditions: [...] }`
- **Konwencja CRUD**: `POST /{entity}`, `PUT /{entity}/:id`, `DELETE /{entity}/:id`

### Mapa endpointów według modułu

#### Auth & Session
| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/login` | POST | Google OAuth login |
| `/logout` | POST | Wylogowanie |
| `/session` | GET | Status sesji |
| `/sessionTaskStatus/:taskId` | GET | Status zadania w sesji |
| `/get-token` | POST | Uzyskanie tokenu OAuth |
| `/oauthcallback` | GET | Google OAuth callback |
| `/client-error` | POST | Raportowanie błędów klienta |

#### Admin
| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/cities` | POST | Szukaj miast |
| `/city` | POST/PUT/DELETE | CRUD miasto |
| `/contractRanges` | POST | Szukaj zakresów kontraktów |
| `/contractRange` | POST/PUT/DELETE | CRUD zakres kontraktów |

#### Contracts (rozbudowany)
| Prefix | Encje |
|--------|-------|
| `/contracts`, `/contract` | Kontrakty główne |
| `/milestones`, `/milestone` | Kamienie milowe |
| `/milestoneDates`, `/milestoneDate` | Daty kamieni milowych |
| `/milestoneTypes`, `/milestoneType` | Typy kamieni milowych |
| `/milestoneTemplates`, `/milestoneTemplate` | Szablony kamieni milowych |
| `/cases`, `/case` | Sprawy |
| `/caseTypes`, `/caseType` | Typy spraw |
| `/caseTemplates`, `/caseTemplate` | Szablony spraw |
| `/caseEvents` | Zdarzenia spraw (GET) |
| `/tasks`, `/task` | Zadania |
| `/taskTemplates`, `/taskTemplate` | Szablony zadań |
| `/risks` | Ryzyka (GET) |
| `/risksReactions` | Reakcje na ryzyka (GET) |
| `/securities`, `/security` | Zabezpieczenia |
| `/materialCards`, `/materialCard` | Karty materiałowe (GET) |
| `/contractTypes`, `/contractType` | Typy kontraktów |

#### Invoices & KSeF
| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/invoices` | POST | Szukaj faktur |
| `/invoice` | POST/PUT/DELETE | CRUD faktura |
| `/invoice/:id/ksef/send` | POST | Wyślij do KSeF |
| `/invoice/:id/ksef/status` | GET | Status KSeF |
| `/invoice/:id/ksef/upo` | GET | Pobierz UPO |
| `/invoice/:id/ksef/xml` | GET | Pobierz XML |
| `/invoice/:id/correction` | POST | Korekta faktury |
| `/invoice/:id/ksef/correction` | POST | Korekta KSeF |
| `/invoiceItems`, `/invoiceItem` | POST/PUT/DELETE | CRUD pozycje faktury |
| `/copyInvoice`, `/copyInvoiceItem` | POST | Kopiuj fakturę/pozycję |
| `/setAsSentInvoice/:id` | PUT | Oznacz jako wysłaną |
| `/setAsPaidInvoice/:id` | PUT | Oznacz jako opłaconą |

#### Cost Invoices (faktury kosztowe)
| Prefix | Operacje |
|--------|----------|
| `/costInvoices/*` | CRUD, import XML, podgląd, statusy |

#### Letters (pisma)
| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/contractsLetters`, `/offersLetters` | POST | Szukaj pism |
| `/letter` (contractOur/contractIncoming/offerOur/offerIncoming) | POST/PUT | CRUD pisma |
| `/exportOurLetterToPDF` | PUT | Eksport do PDF |
| `/approveOurLetter/:id` | PUT | Zatwierdzenie pisma |
| `/autoApproveOurLetters` | GET | Auto-zatwierdzanie |

#### Offers
| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/offers` | POST | Szukaj ofert |
| `/offer` | POST/PUT/DELETE | CRUD oferta |
| `/sendOffer/:id` | PUT | Wyślij ofertę |
| `/exportOurOfferToPDF` | PUT | Eksport do PDF |
| `/offerBonds`, `/offerBond` | POST/DELETE | Wadium |
| `/mailsToCheck`, `/mailInvitations` | POST/PUT/DELETE | Zaproszenia mailowe |

#### Persons (rozbudowany)
| Prefix | Encje |
|--------|-------|
| `/persons`, `/person` | Osoby |
| `/user` | Użytkownik systemu |
| `/systemUser` | Tworzenie użytkownika |
| `/v2/skills` | Słownik umiejętności (v2 API) |
| `/educations/*` | Wykształcenie (CRUD) |
| `/experiences/*` | Doświadczenie (CRUD) |
| `/profileSkills/*` | Umiejętności profilu |
| `/profileImport/*` | Import profilu (analyze + confirm) |
| `/publicProfileSubmission/*` | Publiczne zgłoszenia profili |

#### Other
| Prefix | Moduł |
|--------|-------|
| `/entities`, `/entity` | Podmioty |
| `/projects`, `/project` | Projekty |
| `/financialAidProgrammes` | Programy pomocowe |
| `/focusAreas`, `/focusArea` | Obszary zainteresowania |
| `/applicationCalls`, `/applicationCall` | Nabory wniosków |
| `/needs`, `/need` | Potrzeby |
| `/needsFocusAreas`, `/needFocusArea` | Relacja potrzeby-obszary |
| `/documentTemplates`, `/documentTemplate` | Szablony dokumentów |
| `/meetings`, `/meetingArrangements` | Spotkania (GET only) |
| `/processes`, `/processSteps` | Procesy biznesowe |
| `/processInstances`, `/processStepInstances` | Instancje procesów (GET) |
| `/contractMeetingNotes`, `/contractMeetingNote` | Notatki ze spotkań |
| `/scrumSheet/*` | Scrum Sheet (GET only) |

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
- **Uwaga**: Brak middleware auth guard — prawdopodobnie sprawdzanie sesji w poszczególnych routerach lub na kliencie

### Middleware (kolejność w index.ts)
1. `cors(corsOptions)`
2. `express.json({ limit: '10mb' })`
3. `multer({ storage: memoryStorage() })`
4. `session({ store: MongoStore })`
5. Session logger (console.log)
6. Body parser (`req.parsedBody` / `req.parsedQuery`)
7. Routers (require)
8. Global error handler → `ToolsMail.sendServerErrorReport()`

---

## 7. Git

### Ostatnie 20 commitów

```
b24ca60 oznaczenie modelu i tekenów - import pisma
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

### Format commitów
- **Mieszany**: część angielski, część polski
- **Brak Conventional Commits** (brak prefix fix:/feat:/chore: itp.) — wyjątkiem są commity generowane przez AI (np. "Add person profile import...")
- Polskie commity to szybkie poprawki: "poprawka", "oznaczenie modelu i tekenów"
- Angielskie commity to feature-level opisy

### Branching
- **Main branch**: `main`
- **Feature branches**: `feature-contract-notes`, `persons-v2`, `KSeF`, `AI-API`
- **Refactoring branches**: `MVC-refactoring`, `refactoring-MVC-testy`
- **Inne**: `react`, `historia-sprawdzenie`
- **Strategy**: feature branch → merge to main (brak PR workflow widocznego)

---

## 8. Dokumentacja — inwentarz

### Root-level MD (pliki-skróty)
| Plik | Treść |
|------|-------|
| `CLAUDE.md` | 327 linii — główny plik instrukcji dla AI |
| `AGENTS.md` | Reguły agentów + linki do kanonicznych docs |
| `AGENT_DB_GUIDELINES.md` | Redirect → `docs/team/operations/db-changes.md` |
| `DEV-LOGIN-SETUP.md` | Redirect → `docs/team/runbooks/dev-login.md` |
| `ENVIRONMENT.md` | Redirect → `docs/team/onboarding/environment.md` |
| `TESTING.md` | Redirect → `docs/team/runbooks/testing.md` |
| `TESTING-QUICKSTART.md` | Redirect → `docs/team/runbooks/testing.md` |
| `TESTING-SUMMARY.md` | Redirect → `docs/team/runbooks/testing.md` |

### docs/team/ (kanoniczne)
| Ścieżka | Linii | Opis |
|---------|-------|------|
| `README.md` | 34 | Struktura dokumentacji i polityka zmian |
| `onboarding/environment.md` | 72 | Konfiguracja środowiska |
| `onboarding/local-setup.md` | 28 | Setup lokalny |
| `onboarding/access-and-secrets.md` | 28 | Dostępy i sekrety |
| `runbooks/testing.md` | 55 | Framework testowy |
| `runbooks/dev-login.md` | 60 | Dev login setup |
| `operations/db-changes.md` | 50 | Workflow zmian DB |
| `operations/deployment-heroku.md` | 43 | Procedura deploy |
| `operations/post-change-checklist.md` | 1,211 | Checklista post-zmianowa |
| `operations/persons-v2-refactor-plan.md` | 293 | Plan refaktoru persons v2 |
| `operations/persons-v2-refactor-progress.md` | 1,596 | Postęp refaktoru |
| `operations/contract-meeting-notes-plan.md` | 181 | Plan notatek ze spotkań |
| `operations/contract-meeting-notes-progress.md` | 670 | Postęp notatek |
| `operations/contract-meeting-notes-activity-log.md` | 210 | Log aktywności notatek |
| `operations/hr-module-plan.md` | 378 | Plan modułu HR |
| `operations/hr-module-progress.md` | 161 | Postęp HR |
| `operations/profile-import-progress.md` | 270 | Postęp importu profili |

### .github/instructions/ (instrukcje AI)
| Plik | Linii | Opis |
|------|-------|------|
| `architektura.instructions.md` | 536 | Reguły Clean Architecture (KRYTYCZNY) |
| `architektura-ai-assistant.md` | 481 | Drzewa decyzyjne dla AI |
| `architektura-szczegoly.md` | 805 | Szczegółowe przykłady |
| `architektura-testowanie.md` | 363 | Wytyczne testowe per warstwa |
| `architektura-refactoring-audit.md` | 583 | Checklista audytu refaktoru |
| `refactoring-auth-pattern.md` | 492 | Migracja wzorca OAuth2 withAuth |
| `srodowiska.instructions.md` | 28 | Instrukcje środowiskowe |

### .agents/skills/
| Plik | Opis |
|------|------|
| `db-schema-snapshot-mariadb.md` | Procedura snapshotu schematu DB |
| `persons-v2-migration.md` | Migracja persons v2 |
| `refactoring-audit.md` | Audyt refaktoringu |

---

## 9. Pytania do wyjaśnienia

1. **`src/Tests/` vs `__tests__`** — `src/Tests/` jest w `.gitignore`. Czy to stary katalog? Czy `__tests__/` w modułach to nowa konwencja?
2. **Brak ESLint** — świadoma decyzja czy przeoczenie? TSC strict + Prettier mogą wystarczać.
3. **Brak CI/CD** — deploy manualny na Heroku? Czy jest jakiś zewnętrzny pipeline?
4. **Brak auth middleware** — czy sesja jest sprawdzana per-router, czy klient decyduje o dostępie?
5. **OpenAI SDK** w zależnościach — używany w `profileImport/`. Czy planowane rozszerzenie?
6. **`maintenance/`** — co zawiera? Skrypty jednorazowe?
7. **Session secret hardcoded** w kodzie (`'your-random-secret-19890913007'`) — czy to dev-only?
