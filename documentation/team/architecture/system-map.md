# Mapa Systemu — Serwer ↔ Klient

> Dokument referencyjny: jak PS-nodeJS (backend) i ENVI.ProjectSite (frontend) współpracują.
> Wygenerowano: 2026-02-20

---

## 1. Architektura wysokopoziomowa

```
┌─────────────────────────────────────────────────────────────────┐
│  KLIENT (ENVI.ProjectSite)                                      │
│  React 18 + Bootstrap 5 + react-hook-form                       │
│  HashRouter, sessionStorage state                                │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ FilterTable  │  │ GeneralModal │  │ ProtectedRoute         │  │
│  │ (listy)      │  │ (CRUD forms) │  │ (auth guard, client)   │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────────────────┘  │
│         │                 │                                      │
│  ┌──────┴─────────────────┴──────────────────┐                   │
│  │ RepositoryReact<T> / *Api.ts              │                   │
│  │ (fetch wrapper, retry, sessionStorage)     │                   │
│  └──────────────────┬────────────────────────┘                   │
│                     │ native fetch(), credentials: "include"     │
└─────────────────────┼────────────────────────────────────────────┘
                      │ HTTPS (JSON / FormData)
                      │ Cookie: connect.sid
┌─────────────────────┼────────────────────────────────────────────┐
│  SERWER (PS-nodeJS) │                                            │
│  Express 4 + TypeScript + Clean Architecture                     │
│                     │                                            │
│  ┌──────────────────┴───────────────────┐                        │
│  │ Middleware: CORS → JSON → Multer     │                        │
│  │ → Session (MongoDB) → Body parser    │                        │
│  └──────────────────┬───────────────────┘                        │
│         ┌───────────┴────────────┐                               │
│         │ Router (per module)    │                                │
│         └───────────┬────────────┘                               │
│                     │                                            │
│         ┌───────────┴────────────┐                               │
│         │ Controller (singleton) │←── Validator                   │
│         └───────────┬────────────┘                               │
│                     │                                            │
│         ┌───────────┴────────────┐                               │
│         │ Repository (CRUD)      │                               │
│         └───────────┬────────────┘                               │
│                     │                                            │
│         ┌───────────┴────────────┐  ┌──────────────────────┐    │
│         │ MariaDB 10.6           │  │ Google APIs / KSeF    │    │
│         │ (mysql2 pool)          │  │ (Drive, Docs, Gmail)  │    │
│         └────────────────────────┘  └──────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Flow autentykacji end-to-end

```
                    KLIENT                              SERWER
                    ======                              ======

1. User clicks     ┌─────────────────┐
   "Sign in        │ Google OAuth    │
    with Google"   │ popup           │
                   └────────┬────────┘
                            │ Google ID Token
                            ▼
2.                 POST /login
                   { credential: token }  ──────────►  Verify token
                                                       via Google API
                                                       │
                                                       ▼
                                                       Create session
                                                       (MongoDB store)
                                                       │
                                                       ▼
3.                                        ◄────────── Set-Cookie: connect.sid
                                                       + { userData }
4. Store in        MainSetup.currentUser
   sessionStorage  = response.userData
                            │
                            ▼
5. ALL subsequent  fetch(url, {
   requests        credentials: "include"  ──────────► Session validated
                   })                                   via connect.sid
                            │
                            ▼
6. Page load       GET /session           ──────────►  Check session
                                          ◄──────────  { userData } | 401
                            │
7. Route guard     ProtectedRoute checks
                   sessionStorage.systemRoleName
                   (CLIENT-SIDE ONLY)

8. Logout          POST /logout           ──────────►  Destroy session
                   window.location.reload()
```

**Dev mode:** `POST /login { dev_mode: true, mock_user: "playwright_test_user" }` — pomija Google OAuth.

---

## 3. Mapa endpointów serwer → klient

### Legenda
- ✅ = używany przez klienta
- 🔧 = server-only (cron, scripts, admin)
- ❓ = prawdopodobnie używany (brak 100% pewności)

### Auth & Session

| Endpoint | Metoda | Klient | Uwagi |
|----------|--------|--------|-------|
| `/login` | POST | ✅ LoginPage.tsx | Google OAuth + dev mode |
| `/logout` | POST | ✅ MainWindow | Logout + reload |
| `/session` | GET | ✅ MainWindow | Weryfikacja sesji przy page load |
| `/sessionTaskStatus/:taskId` | GET | ✅ RepositoryReact | Polling async tasks |
| `/get-token` | POST | ❓ | OAuth token refresh |
| `/oauthcallback` | GET | ❓ | Google OAuth callback |
| `/client-error` | POST | ✅ ToolsFetch | Raportowanie błędów klienta |

### Admin

| Endpoint | Metoda | Klient | Uwagi |
|----------|--------|--------|-------|
| `/cities` | POST | ✅ CitiesSearch | Lista miast |
| `/city` | POST/PUT/DELETE | ✅ CitiesModal | CRUD miasto |
| `/contractRanges` | POST | ✅ ContractRangesSearch | Lista zakresów |
| `/contractRange` | POST/PUT/DELETE | ✅ ContractRangesModal | CRUD zakres |

### Contracts

| Endpoint | Metoda | Klient | Uwagi |
|----------|--------|--------|-------|
| `/contracts` | POST | ✅ ContractsSearch | Lista kontraktów |
| `/contract` | POST/PUT/DELETE | ✅ ContractsModal | CRUD kontrakt |
| `/milestones` | POST | ✅ | Lista kamieni milowych |
| `/milestone` | POST/PUT/DELETE | ✅ | CRUD kamień milowy |
| `/cases` | POST | ✅ | Lista spraw |
| `/case` | POST/PUT/DELETE | ✅ | CRUD sprawa |
| `/tasks` | POST | ✅ TasksGlobal | Lista zadań |
| `/task` | POST/PUT/DELETE | ✅ | CRUD zadanie |
| `/contractTypes` | POST | ✅ | Lista typów kontraktów |
| `/milestoneTypes` | POST | ✅ | Lista typów kamieni |
| `/caseTypes` | POST | ✅ | Lista typów spraw |
| `/securities` | POST | ✅ | Lista zabezpieczeń |
| `/materialCards` | GET | ❓ | Karty materiałowe |
| `/risks` | GET | ✅ | Ryzyka |

### Invoices & KSeF

| Endpoint | Metoda | Klient | Uwagi |
|----------|--------|--------|-------|
| `/invoices` | POST | ✅ InvoicesSearch | Lista faktur |
| `/invoice` | POST/PUT/DELETE | ✅ InvoicesModal | CRUD faktura |
| `/invoice/:id/ksef/*` | POST/GET | ✅ | Integracja KSeF |
| `/invoiceItems` | POST | ✅ | Pozycje faktur |
| `/invoiceItem` | POST/PUT/DELETE | ✅ | CRUD pozycja |
| `/costInvoices` | POST | ✅ CostInvoicesSearch | Faktury kosztowe |
| `/costInvoice` | POST/PUT/DELETE/PATCH | ✅ | CRUD faktura kosztowa |

### Letters

| Endpoint | Metoda | Klient | Uwagi |
|----------|--------|--------|-------|
| `/contractsLetters` | POST | ✅ LettersSearch | Pisma kontraktowe |
| `/offersLetters` | POST | ✅ | Pisma ofertowe |
| `/letter` | POST/PUT | ✅ | CRUD pismo (polimorficzny) |
| `/exportOurLetterToPDF` | PUT | ✅ | Eksport do PDF |
| `/approveOurLetter/:id` | PUT | ✅ | Zatwierdzenie |

### Offers

| Endpoint | Metoda | Klient | Uwagi |
|----------|--------|--------|-------|
| `/offers` | POST | ✅ OffersSearch | Lista ofert |
| `/offer` | POST/PUT/DELETE | ✅ OffersModal | CRUD oferta |
| `/offerBonds` | POST/DELETE | ✅ | Wadium |
| `/mailsToCheck` | POST | ✅ | Mail zaproszenia |

### Persons

| Endpoint | Metoda | Klient | Uwagi |
|----------|--------|--------|-------|
| `/persons` | POST | ✅ PersonsSearch | Lista osób |
| `/person` | POST/PUT/DELETE | ✅ PersonsModal | CRUD osoba |
| `/v2/skills` | GET/POST/PUT/DELETE | ✅ SkillsDictionary | Słownik umiejętności v2 |
| `/educations/*` | POST/PUT/DELETE | ✅ PersonProfile | CRUD wykształcenie |
| `/experiences/*` | POST/PUT/DELETE | ✅ PersonProfile | CRUD doświadczenie |
| `/profileSkills/*` | POST/PUT/DELETE | ✅ PersonProfile | CRUD umiejętności |
| `/profileImport/*` | POST | ✅ PersonProfile | Import profilu AI |
| `/publicProfileSubmission/*` | GET/POST/PUT | ✅ PublicProfilePage | Zgłoszenia publiczne |

### Other

| Endpoint | Metoda | Klient | Uwagi |
|----------|--------|--------|-------|
| `/entities` | POST | ✅ EntitiesSearch | Podmioty |
| `/entity` | POST/PUT/DELETE | ✅ | CRUD podmiot |
| `/projects` | POST | ✅ ProjectsSearch | Projekty |
| `/project` | POST/PUT/DELETE | ✅ | CRUD projekt |
| `/financialAidProgrammes` | POST | ✅ | Programy |
| `/focusAreas` | POST | ✅ | Obszary |
| `/applicationCalls` | POST | ✅ | Nabory |
| `/needs` | POST | ✅ | Potrzeby |
| `/documentTemplates` | POST | ✅ | Szablony dokumentów |
| `/meetings` | GET | ❓ | Spotkania (read-only) |
| `/contractMeetingNotes` | POST | ✅ | Notatki ze spotkań |
| `/scrumSheet/*` | GET | 🔧 | Scrum backup (cron) |

---

## 4. Wspólne typy / interfejsy

### Definicje typów — dwie osobne kopie

| Aspekt | Serwer (PS-nodeJS) | Klient (ENVI.ProjectSite) |
|--------|-------------------|--------------------------|
| Plik | `src/types/types.d.ts` | `Typings/bussinesTypes.d.ts` |
| LOC | ~200 | ~819 |
| Zakres | Typy wewnętrzne + model | Pełne interfejsy danych |
| Sync | **Ręczny** | **Ręczny** |

**Brak shared package** — typy utrzymywane niezależnie w obu projektach.

### Konwencja `_` prefix (współdzielona)

```
Pola z _ na początku = relacje/dane nietrwałe
Pola bez _ = kolumny DB

Serwer (Model.toJson()):
  { id: 1, name: "...", _project: { id: 5, ... } }

Klient (bussinesTypes.d.ts):
  interface ContractData { id: number; name: string; _project: ProjectData; }
```

Konwencja jest **spójna** po obu stronach.

### Typ `PaymentStatus` (faktury kosztowe)

Typ współdzielony między serwerem a klientem; utrzymywany ręcznie w obu projektach.

| Wartość | Znaczenie |
|---------|-----------|
| `UNPAID` | Brak płatności |
| `PARTIALLY_PAID` | Częściowo zapłacona |
| `PAID` | W pełni zapłacona |
| `NOT_APPLICABLE` | Nie dotyczy — korekta in minus (ujemna kwota brutto) bez sekcji `Platnosc` w KSeF XML |

**Logika przypisania — backend (`costInvoiceXmlHelpers.extractPaymentInfoFromFa`):**
- `grossAmount < 0` i brak / pusta sekcja `Platnosc` w KSeF XML → `NOT_APPLICABLE`
- Pozostałe przypadki → `UNPAID` / `PARTIALLY_PAID` / `PAID` na podstawie flag i kwot z XML

**Prezentacja — frontend (`CostInvoicesList`):**
- `PaymentStatusBadge` — badge „–" (wariant `info`) dla `NOT_APPLICABLE`
- `costInvoicePaymentFilters` — opcja filtra „Nie dotyczy" (`NOT_APPLICABLE`)

---

### Nazewnictwo pól — mapowanie

| Serwer (DB column) | Serwer (model) | Klient (interfejs) |
|--------------------|-----------------|--------------------|
| `Id` | `id` | `id` |
| `ContractId` | `contractId` | `contractId` |
| `SequenceNumber` | `sequenceNumber` | `sequenceNumber` |
| PascalCase | camelCase | camelCase |

Konwersja PascalCase (DB) → camelCase (kod) odbywa się w `mapRowToModel()` na serwerze.

---

## 5. Przepływ danych (typowy CRUD)

### Find (lista)

```
Klient                                 Serwer
======                                 ======

FilterPanel
  │ user sets filters
  ▼
RepositoryReact.
  loadItemsFromServerPOST(
    [{ field: "value" }]
  )
  │
  ▼
POST /{entities}               ──────► Router
body: { orConditions: [...] }          │
                                       ▼
                               Controller.find(orConditions)
                                       │
                                       ▼
                               Repository.find(searchParams)
                                       │
                                       ▼
                               SQL: SELECT ... WHERE conditions
                                       │
                                       ▼
                               mapRowToModel() × N rows
                                       │
                                       ▼
                               ◄────── res.send(items[])
  │
  ▼
repo.items = response
repo.saveToSessionStorage()
FilterableTable re-renders
```

### Add/Edit

```
Klient                                 Serwer
======                                 ======

GeneralModal
  │ useForm() + yup validation
  │ onSubmit(data)
  ▼
Detect files?
  ├── yes → FormData
  └── no  → JSON object
  │
  ▼
POST|PUT /{entity}             ──────► Router
body: data                             │
                                       ▼
                               Controller.addFromDto(dto)
                               or Controller.editFromDto(dto)
                                       │
                                       ├── Validator.validate(dto)
                                       │
                                       ▼
                               ToolsDb.transaction(async (conn) => {
                                   Repository.addInDb(item, conn)
                                   // optional: Google Drive folder
                               })
                                       │
                                       ▼
                               ◄────── res.send(result)
  │
  ▼
Update repo.items
Close modal
Refresh list
```

### Async Task (long-running)

```
Klient                                 Serwer
======                                 ======

POST /action               ──────────► Start task
                           ◄──────────  { taskId: "abc" }
  │
  ▼
pollTask(taskId):
  GET /sessionTaskStatus/abc ────────► Check session task
  every 2s, max 60 times   ◄────────  { status: "processing", progress: 50 }
  │
  ▼ (when done)
                            ◄────────  { status: "done", result: {...} }
  │
  ▼
Handle result
Close progress bar
```

---

## 6. Niespójności i uwagi

### Potwierdzone niespójności

1. **Typy utrzymywane osobno** — brak shared package, ręczna synchronizacja typów
2. **Brak centralnego auth middleware** na serwerze — klient zabezpiecza trasy sessionStorage-based (`ProtectedRoute`), ale serwer nie ma guard middleware
3. **Delete bez retry** — klient: `deleteItemNodeJS` używa raw `fetch()`, inne operacje mają `fetchWithRetry`
4. **Dwa wzorce API na kliencie** — legacy `RepositoryReact` i nowe `*Api.ts` (migracja w toku)
5. **SystemRoleName definiowany w 2+ miejscach** — klient (`bussinesTypes.d.ts` + `sessionTypes.ts`), serwer (prawdopodobnie kolejna definicja)
6. **Hardcoded URLs** — serwer: CORS whitelist; klient: serverUrl w kodzie

### Spójne konwencje

1. **`_` prefix** — pola relacyjne/nie-DB — spójne po obu stronach
2. **camelCase** — nazewnictwo pól — spójne
3. **REST konwencje** — POST/find, POST/add, PUT/edit, DELETE — spójne
4. **Nazwy tras** — `contracts`, `persons`, `invoices` — matchują endpointy serwera
5. **JSON format** — request/response — spójny
6. **Cookie session** — `credentials: "include"` ↔ `connect.sid` — działa poprawnie
