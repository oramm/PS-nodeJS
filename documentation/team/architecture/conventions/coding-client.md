# Audyt Klienta — ENVI.ProjectSite

> Dokument referencyjny dla przyszłych agentów.
> Wygenerowano: 2026-02-20

---

## 1. Stack technologiczny (Quick Reference)

| Warstwa | Technologia | Wersja |
|---------|------------|--------|
| Język | TypeScript | ^5.0.0 (strict mode) |
| Framework UI | React | 18.2.0 (concurrent mode, createRoot) |
| Component library | React Bootstrap | 2.7.0 (Bootstrap 5.3.5) |
| Routing | react-router-dom | 6.17.0 (HashRouter) |
| Formularze | react-hook-form | 7.43.9 + yup 1.1.1 |
| Ikony | FontAwesome | @fortawesome/react-fontawesome 0.2.0 |
| Bundler | Webpack | 5.75.0 + webpack-dev-server 4.11.1 |
| TS Loader | ts-loader | 9.4.2 |
| Test runner | Vitest | 2.1.8 |
| Test library | @testing-library/react | 16.2.0 |
| Typeahead | react-bootstrap-typeahead | 6.0.2 |
| Numerics | react-number-format | 5.1.4 |
| Toasts | react-toastify | 9.1.3 |
| Deep merge | lodash.merge | 4.6.2 |
| Auth | @react-oauth/google | 0.9.0 |
| Screenshots | puppeteer | 24.35.0 |
| Formatter | Brak (brak .prettierrc/.eslintrc) |
| Linter | **BRAK** (brak ESLint) |
| CI/CD | **BRAK** |
| Deploy | GitHub Pages (docs/ folder) |
| Package manager | Yarn (classic) |

**Protokół komunikacji:** REST API (JSON) via native `fetch()` — brak axios.

---

## 2. Struktura katalogów

```
ENVI.ProjectSite/                    # Root
├── src/                             # 272 plików TS/TSX, ~25,800 LOC
│   ├── React/                       # Core React infrastructure
│   │   ├── MainWindow/              # Entry point (index.tsx), routing, layout
│   │   │   └── index.tsx            # Routes, HashRouter, ProtectedRoute
│   │   ├── MainSetupReact.ts        # Global singleton (serverUrl, currentUser, repos)
│   │   ├── RepositoryReact.ts       # Generic API/state class (493 LOC)
│   │   └── Tools/                   # ToolsFetch.ts, FormContext.ts
│   ├── Admin/                       # Admin domain
│   │   ├── Cities/                  # CRUD miast
│   │   ├── ContractRanges/          # Zakresy kontraktów
│   │   ├── SkillsDictionary/        # Słownik umiejętności (v2, testy)
│   │   └── SystemUsers/             # Użytkownicy systemowi
│   ├── Contracts/                   # Kontrakty
│   │   ├── ContractsList/           # Lista kontraktów
│   │   ├── Dates/                   # Daty kontraktów
│   │   └── Roles/                   # Role kontraktowe
│   ├── Entities/                    # Podmioty gospodarcze
│   │   └── Modals/                  # Modale CRUD
│   ├── Erp/                         # Faktury
│   │   ├── CostInvoicesList/        # Faktury kosztowe (550 LOC details)
│   │   └── InvoicesList/            # Faktury sprzedażowe
│   ├── financialAidProgrammes/      # Programy pomocowe
│   │   ├── FocusAreas/              # Obszary zainteresowania
│   │   ├── needs/                   # Potrzeby
│   │   └── Programmes/              # Programy
│   ├── Letters/                     # Pisma
│   │   └── LettersList/             # Lista pism
│   ├── Offers/                      # Oferty
│   │   ├── OffersList/              # Lista ofert
│   │   └── OffersLettersList/       # Pisma ofertowe
│   ├── Persons/                     # Osoby — NAJWIĘKSZY moduł klienta
│   │   ├── Modals/                  # Modale CRUD osób
│   │   └── PersonProfile/           # Profil osoby (573 LOC page)
│   │       ├── Education/           # Wykształcenie
│   │       ├── Experience/          # Doświadczenie
│   │       ├── ProfileSkills/       # Umiejętności profilu
│   │       └── PublicProfileSubmission/  # Publiczne zgłoszenia
│   ├── Projects/                    # Projekty
│   │   └── Modals/                  # Modale CRUD
│   ├── TasksGlobal/                 # Globalne zadania
│   │   └── Modals/                  # Modale zadań
│   ├── View/                        # Shared view layer
│   │   ├── CommonComponents/        # ErrorBoundary, ProtectedRoute, LoginPage
│   │   ├── Modals/                  # GeneralModal, CommonFormComponents
│   │   │   └── CommonFormComponents/
│   │   │       ├── BussinesObjectSelectors.tsx  # 1,626 LOC — GOD COMPONENT
│   │   │       └── GenericComponents.tsx        # 563 LOC
│   │   └── Resultsets/              # FilterableTable (483 LOC), tabele wynikowe
│   ├── Css/                         # Pliki CSS (7 plików, ~419 LOC)
│   ├── Resources/                   # Zasoby statyczne (logo, ikony)
│   └── test/                        # Test setup (setupTests.ts)
├── Typings/                         # Globalne typy TS
│   ├── bussinesTypes.d.ts           # Typy domenowe (~819 LOC) — GŁÓWNY plik typów
│   ├── sessionTypes.ts              # Typy sesji i auth
│   ├── custom.d.ts                  # Deklaracje modułów
│   └── typeGuards.ts                # Type guardy
├── docs/                            # BUILD OUTPUT → GitHub Pages
├── instructions/                    # Instrukcje AI/Copilot
├── scripts/                         # Skrypty build (screenshot.js)
├── tsconfig.json
├── webpack.config.mjs
├── vitest.config.ts
└── package.json
```

### Metryki

| Metryka | Wartość |
|---------|--------|
| Pliki TypeScript (src/ + Typings/) | 272 |
| Szacowane LOC (TS/TSX) | ~25,800 |
| Pliki CSS | 7 (~419 LOC) |
| Pliki testowe | 6 (~256 LOC) |
| Moduły domenowe | 11 |
| Największy plik | BussinesObjectSelectors.tsx (1,626 LOC) |
| Bundle output | docs/bundle.js (~7 MB) |

---

## 3. Architektura i wzorce

### Struktura komponentów — domain-first

Katalogi odzwierciedlają moduły serwera:
```
src/{Domain}/
├── {Domain}Search.tsx          # Strona listy z FilterableTable
├── {Domain}Controller.ts       # Instancje RepositoryReact
├── Modals/                     # Modale add/edit (body components)
└── {Domain}ModalButtons.tsx    # Fabryka przycisków → GeneralModal
```

### Hierarchia komponentów (typowa)

```
*Search.tsx
  └── FilterableTable
        ├── FilterPanel (kryteria filtrowania)
        ├── AddNewButtonComponent → GeneralModal
        └── ResultSetTable
              └── Row → EditButtonComponent → GeneralModal
```

### RepositoryReact<T> — centralny wzorzec API/State

```typescript
class RepositoryReact<T> {
    items: T[];                    // Pełna lista z serwera
    currentItems: T[];             // Wybrane elementy
    pendingRequests: Map<string, Promise>;  // Deduplikacja requestów

    // CRUD
    loadItemsFromServerPOST(orConditions) → POST /{getRoute}
    addNewItemAsync(item) → POST /{addRoute}
    editItem(item) → PUT /{editRoute}/:id
    deleteItemNodeJS(id) → DELETE /{deleteRoute}/:id

    // Persistence
    saveToSessionStorage() → sessionStorage
    loadFromSessionStorage() → items
}
```

**Uwaga:** Nowsze moduły (Persons v2, CostInvoices, PublicProfile) przechodzą na **standalone API files** (`*Api.ts`) z typowanymi DTO i własnymi klasami błędów, pomijając `RepositoryReact`.

### Formularze — GeneralModal + react-hook-form

```
GeneralModal
  ├── useForm() + yupResolver (walidacja)
  ├── Detects files → FormData vs JSON
  ├── ProgressBar (async task polling)
  └── ErrorBoundary (window.error listener)
```

### Async Task Pattern (Long-Running Operations)

```
1. Client POST → Server returns { taskId: "..." }
2. Client polls GET /sessionTaskStatus/:taskId co 2s (max 60 × 2s = 2 min)
3. ProgressBar w GeneralModal
4. Wynik gdy status !== "processing"
```

### State Management

**Brak globalnego state managera** (brak Redux/Zustand/MobX).

Stan zarządzany przez:
1. **`RepositoryReact<T>`** — instancje klas jako mutable stores
2. **`sessionStorage`** — persystencja danych między nawigacjami
3. **`MainSetup`** — statyczny singleton (serverUrl, currentUser, repozytoria)
4. **`useState` + `useEffect`** — lokalny stan komponentów
5. **`FilterableTableProvider`** — React Context wewnątrz FilterableTable

### Routing

- **`HashRouter`** z `basename="/"`
- Routes centralne w `src/React/MainWindow/index.tsx`
- **`ProtectedRoute`** — sprawdza `MainSetup.currentUser.systemRoleName` z sessionStorage
- Publiczne ścieżki: `/public/profile-submission/:token` (poza auth flow)

### Auth Flow (klient)

```
1. Google OAuth popup → Google ID token
2. POST /login { credential: token }
3. Server sets cookie (connect.sid)
4. Client: MainSetup.currentUser = userData → sessionStorage
5. Subsequent requests: credentials: "include" → cookie auto-sent
6. GET /session → weryfikacja sesji przy page load
7. POST /logout → reload
```

### Dev Login

```typescript
// Gdy ENABLE_DEV_LOGIN=true (env serwera)
handleDevLogin → POST /login { dev_mode: true, mock_user: "playwright_test_user" }
```

---

## 4. Konwencje kodowania

### Nazewnictwo

| Element | Konwencja | Przykład |
|---------|-----------|---------|
| Komponenty | PascalCase.tsx | `ContractsSearch.tsx` |
| Repozytoria/Controllery | PascalCase.ts | `ContractsController.ts` |
| API files (nowe) | camelCaseApi.ts | `skillsDictionaryApi.ts` |
| Interfejsy typów | PascalCase | `ContractData`, `PersonData` |
| Instancje repo | camelCase const | `contractsRepository` |
| Pola relacyjne (nie-DB) | `_` prefix | `_project`, `_editor`, `_gdFolderUrl` |
| Trasy API | plain string | `"contracts"`, `"persons"` |

### Styl kodu

- **Tabwidth**: 4 spacje (z tsconfig)
- **Cudzysłowy**: single quotes (`'...'`)
- **JSX**: classic runtime (`"jsx": "react"`)
- **Komponenty**: Functional (nie class-based)
- **Brak formattera/linka**: tylko TSC strict

---

## 5. Komunikacja z serwerem

### Server URL

```typescript
// MainSetupReact.ts — HARDCODED
static serverUrl = window.location.href.includes("localhost")
    ? "http://localhost:3000/"
    : "https://erp-envi.herokuapp.com/";
```

### HTTP Konwencje

| Operacja | Metoda HTTP | Pattern |
|----------|-------------|---------|
| Szukaj/Lista | POST | `POST /{entities}` z body `{ orConditions }` |
| Dodaj | POST | `POST /{entity}` |
| Edytuj | PUT | `PUT /{entity}/:id` |
| Usuń | DELETE | `DELETE /{entity}/:id` |
| Sesja | GET | `GET /session` |
| Task status | GET | `GET /sessionTaskStatus/:taskId` |

### Fetch wrapper

```typescript
// ToolsFetch.ts
fetchWithRetry(url, options, retries=3, delay=1000)
  → native fetch() z retry logic

fetchJsonWithSafeError(url, options)
  → fetch + custom error classes (nowsze moduły)
```

**Uwaga:** `deleteItemNodeJS` NIE używa `fetchWithRetry` — bezpośredni `fetch()`.

### Headers

- JSON: `Content-Type: application/json`
- FormData: brak explicit Content-Type (browser ustawia multipart boundary)
- Cookies: `credentials: "include"` zawsze

### File Upload

```typescript
// GeneralModal detects files
const hasFiles = Object.values(data).some(v => v instanceof FileList || v instanceof File);
const requestData = hasFiles ? parseFieldValuesToFormData(data) : data;
// FormData: _originalData appended as JSON string
```

---

## 6. Typy — bussinesTypes.d.ts

### Główne interfejsy (~819 LOC)

| Interfejs | Opis |
|-----------|------|
| `ContractData`, `OurContract`, `OtherContract` | Kontrakty |
| `MilestoneData`, `CaseData`, `TaskData` | Hierarchia milestone/case/task |
| `InvoiceData` | Faktury sprzedażowe |
| `CostInvoiceData`, `CostInvoiceItemData` | Faktury kosztowe |
| `LetterData`, `OurLetter`, `IncomingLetter` | Pisma (polimorficzne) |
| `OfferData`, `OurOffer`, `ExternalOffer` | Oferty (polimorficzne) |
| `PersonData`, `PersonProfileV2Data` | Osoby |
| `EducationData`, `ExperienceData` | Wykształcenie, doświadczenie |
| `ProjectData` | Projekty |
| `EntityData` | Podmioty |
| `AiPersonProfileResult` | Wyniki importu AI |

### Znalezione problemy

1. **Import runtime w `.d.ts`**: `import { number } from "yup"` (nieużywany), `import MainSetup` (nieużywany)
2. **Duplikaty pól**: `ProjectData.ourId` ×2, `ProjectData.gdFolderId` ×2, `OurContract._admin` ×2, `CaseType.isDefault` ×2
3. **Konwencja `_` prefix**: stosowana konsekwentnie (pola relacyjne/nie-DB)

---

## 7. Testy i jakość

### Testy

| Plik testowy | Co testuje |
|-------------|-----------|
| `skillsDictionaryApi.test.ts` | Mappery DTO (pure functions) |
| `SkillDictionaryValidationSchema.test.ts` | Schemat walidacji Yup |
| `SkillsDictionarySearch.test.tsx` | Renderowanie komponentu |
| `PersonProfileSkillDescription.test.tsx` | Renderowanie komponentu |
| `personPublicProfileSubmissionReviewApi.test.ts` | Warstwa API |
| `publicProfileSubmissionApi.test.ts` | Warstwa API |

**Pokrycie: ~2% codebase** — testy tylko w 2 najnowszych modułach (SkillsDictionary, PersonProfile).

### Narzędzia jakości

| Narzędzie | Stan |
|-----------|------|
| TypeScript strict | Włączony |
| ESLint | **BRAK** |
| Prettier | **BRAK** |
| Pre-commit hooks | **BRAK** |
| CI/CD | **BRAK** |
| Test coverage reporter | Nie skonfigurowany |

---

## 8. Znalezione problemy i ryzyka

### Krytyczne

1. **`BussinesObjectSelectors.tsx` = 1,626 LOC** — God Component, wszystkie selektory w jednym pliku
2. **Brak CI/CD** — build nigdy automatycznie walidowany, merge do main może zepsuć build
3. **Hardcoded production URL** — `https://erp-envi.herokuapp.com/` w kodzie, nieskonfigurowane przez env
4. **`ErrorBoundary` nie jest prawdziwym React error boundary** — używa `window.addEventListener('error')` zamiast `componentDidCatch`, nie łapie błędów render phase

### Ważne

5. **`deleteItemNodeJS` bez retry** — bezpośredni `fetch()`, brak error recovery
6. **`tsconfig.json` case mismatch** — `include: ["typings/*"]` ale folder to `Typings/` (działa na Windows, padnie na Linux)
7. **Duplikaty pól w bussinesTypes.d.ts** — copy-paste errors, mogą powodować confusion
8. **SessionStorage jako state store** — duże datasety (all contracts) mogą uderzyć w limit storage lub spowolnić
9. **Brak ESLint/Prettier** — brak automatyzacji jakości kodu
10. **`SystemRoleName` zdefiniowane w 2 miejscach** — literal union w bussinesTypes.d.ts + enum w sessionTypes.ts

### Drobne

11. **`React.StrictMode` tylko w dev** — production bez double-render detection
12. **Bundle ~7MB** — brak code splitting, tree shaking ograniczone (single bundle)
13. **`lodash.merge` w devDependencies** ale używany runtime — powinien być w dependencies
14. **`react-router-dom` w devDependencies** — j.w., powinien być w dependencies

---

## 9. Rekomendacje

1. **Rozbić `BussinesObjectSelectors.tsx`** na osobne pliki per selektor
2. **Dodać ESLint** z regułami React + TypeScript
3. **Przenieść serverUrl do zmiennej env** (webpack DefinePlugin)
4. **Poprawić ErrorBoundary** na prawdziwy class-based React Error Boundary
5. **Dodać CI pipeline** (GitHub Actions) z build + test
6. **Przenieść runtime deps** z devDependencies do dependencies
7. **Poprawić tsconfig include case** (`Typings/*`)
8. **Usunąć duplikaty pól** w bussinesTypes.d.ts
9. **Dodać code splitting** (React.lazy + Suspense) dla zmniejszenia bundle size
