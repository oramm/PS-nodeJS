# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PS-NodeJS is an Express.js backend application built with TypeScript, implementing Clean Architecture principles. It manages projects, contracts, invoices, letters, offers, and related business entities with integration to Google Drive, Google Docs, MariaDB, and MongoDB.

## Development Commands

### Environment Setup
```bash
# Install dependencies
yarn install

# Start development server (localhost database)
yarn start

# Start production mode (production database - DO NOT USE LOCALLY)
yarn start:prod

# Debug mode with inspector
yarn debug

# Build TypeScript to JavaScript
yarn build
```

### Testing
```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:coverage

# Run specific module tests
yarn test:offers
```

### Code Quality
```bash
# Check for circular dependencies
yarn check:cycles
```

### Scripts
```bash
# Send milestone report (production only)
yarn send-milestone-report
```

## Architecture: Clean Architecture (Critical)

This project follows **Clean Architecture** with strict layer separation. The architectural rules are **NON-NEGOTIABLE** and documented in `.github/instructions/architektura.instructions.md`.

### Layer Flow (Mandatory)
```
Router → (Validator) → Controller → Repository → Model
                                           ↓
                                    ToolsDb/ToolsGd/ToolsEmail
```

### Critical Rules

**MUST**:
1. Flow: Router → (Validator) → Controller → Repository → Model
2. Controller manages database transactions (NOT Repository)
3. Validator MUST be a separate class (if needed)
4. Use standard CRUD method names: `find()`, `addFromDto()`, `add()`, `editFromDto()`, `edit()`, `delete()`

**MUST NOT**:
1. Model MUST NOT import Controller or Repository
2. Model MUST NOT perform database I/O operations
3. Repository MUST NOT contain business logic
4. Router MUST NOT create Model instances or call Repository directly
5. Validator MUST NOT be inside Router, Controller, Repository, or Model

### Base Classes

#### BaseController<T, R>
- Located: `src/controllers/BaseController.ts`
- Pattern: Singleton with static public methods
- `getInstance()` is ALWAYS private
- Controllers expose static methods: `add()`, `edit()`, `delete()`, `find()`
- Use `withAuth()` helper for Google API operations requiring OAuth2Client

#### BaseRepository<T>
- Located: `src/repositories/BaseRepository.ts`
- Implements CRUD: `addInDb()`, `editInDb()`, `deleteFromDb()`, `find()`
- Abstract methods: `mapRowToModel()`, `find()`
- Use `makeAndConditions()` pattern for building SQL WHERE clauses
- Use `makeOrGroupsConditions()` for OR conditions

### Validator Pattern

Required for:
- Entities with polymorphism (Letters, Offers, Invoices)
- Entities with complex DTOs (>10 fields, inter-field dependencies)
- Entities requiring contextual validation

Validators:
- MUST be separate classes (e.g., `LetterValidator`, `InvoiceValidator`)
- Located alongside Model in domain layer
- Called ONLY by Controller (in `addFromDto`/`editFromDto`)
- MUST throw errors on invalid data (fail-fast)
- Use TypeResolver pattern for type determination logic

Example validators: `src/invoices/InvoiceValidator.ts`, `src/letters/LetterValidator.ts`

## Environment Configuration

### Environment Loading
- Uses `src/setup/loadEnv.ts` (loads `.env` then `.env.{NODE_ENV}` with override)
- **Default environment: production** (no `NODE_ENV` = production database on kylos)
- ALWAYS import and call `loadEnv()` at the top of entry point files

### Environment Files
- `.env` - Shared configuration (SMTP, Google OAuth, KSeF, sessions) - NOT in repo
- `.env.development` - Local database (localhost) - NOT in repo
- `.env.production` - Production database (kylos) - NOT in repo
- `.env.example` - Template file - IN repo (copy to `.env.development`)

### Database Connections

**MariaDB (Primary Data)**:
- Production: MariaDB 10.6.x on `envi-konsulting.kylos.pl`
- Development: MariaDB 10.6.x on `localhost`
- Database: `envikons_myEnvi`
- Client: `mysql2/promise`
- Connection pooling via `ToolsDb` (src/tools/ToolsDb.ts)
- **IMPORTANT**: Always check logs `[ENV] DB target:` to verify which database is connected

**MongoDB (Sessions)**:
- Used for Express session storage via `connect-mongo`
- Configured in `src/index.ts`

### Quick Start for New Developers
1. Install MariaDB 10.6.x (NOT 11.x or 12.x)
2. Create database: `CREATE DATABASE envikons_myEnvi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
3. Import data: `mysql -u root -p envikons_myEnvi < full_dump.sql`
4. Copy `.env.example` to `.env.development` and fill `DB_PASSWORD`
5. Run `yarn start` - logs should show `[ENV] DB target: localhost/envikons_myEnvi`

## Key Technologies

- **Runtime**: Node.js >=22.17.0 <25.0.0
- **Language**: TypeScript 5.x (strict mode enabled)
- **Framework**: Express.js 4.x
- **Databases**: MariaDB 10.6.x (via mysql2), MongoDB (sessions)
- **Testing**: Jest + ts-jest
- **Google APIs**: googleapis (Drive, Docs, Gmail, Sheets)
- **Email**: nodemailer (SMTP), imapflow (IMAP)
- **Other**: express-session, multer (file upload), node-cron, fuse.js

## Project Structure

```
src/
├── index.ts                      # Application entry point
├── setup/
│   ├── loadEnv.ts               # Environment variable loading (MUST use in entry points)
│   └── Sessions/
│       ├── ToolsGapi.ts         # Google API authentication helper
│       └── Gauth2Routers.ts     # OAuth2 routes
├── controllers/
│   └── BaseController.ts        # Base controller with Singleton pattern
├── repositories/
│   └── BaseRepository.ts        # Base repository with CRUD operations
├── tools/
│   ├── ToolsDb.ts              # Database connection and query helpers
│   ├── ToolsGd.ts              # Google Drive operations
│   ├── ToolsEmail.ts           # Email operations
│   ├── ToolsDocs.ts            # Google Docs operations
│   └── ToolsSheets.ts          # Google Sheets operations
├── Admin/
│   ├── Cities/                 # City entity (simple CRUD example)
│   └── ContractRanges/         # Contract ranges management
├── contracts/                   # Contract management with milestones, cases, tasks
├── invoices/                    # Invoice management with KSeF integration
├── letters/                     # Letter management (polymorphic: Our/Incoming, Contract/Offer)
├── offers/                      # Offer management with Google Drive integration
├── projects/                    # Project management
├── entities/                    # Business entity management
├── persons/                     # Person and role management
├── financialAidProgrammes/     # Financial aid programs, focus areas, application calls
├── documentTemplates/          # Document template management
└── types/                      # TypeScript type definitions
```

## Domain Modules

### Letters (Polymorphic Example)
- Hierarchy: `Letter` → `OurLetter`/`IncomingLetter` → `OurLetterContract`/`OurLetterOffer`/`IncomingLetterContract`/`IncomingLetterOffer`
- Uses: `LetterValidator` and `LetterTypeResolver` for type determination
- Google Drive integration for document storage

### Invoices
- Types: KSeF invoices, regular invoices
- Uses: `InvoiceValidator` for validation
- Integration with Polish KSeF (National e-Invoice System)

### Offers
- Types: `OurOffer`, `ExternalOffer`
- Testing example: `src/offers/__tests__/`
- Google Drive integration for offer documents

### Contracts
- Complex hierarchy with milestones, cases, and tasks
- Material cards and settlements
- Integration with projects and contract types

## Google API Integration

### Authentication Pattern
Use `ToolsGapi.gapiReguestHandler()` in Routers for operations requiring OAuth2:

```typescript
// In Router:
await ToolsGapi.gapiReguestHandler(req, res, async (auth: OAuth2Client) => {
    await model.someGoogleApiMethod(auth);
});
```

**Rules**:
- Callback function MUST be `async` and accept `OAuth2Client` as first parameter
- Use ONLY in Router (not in Controller/Repository/Model)
- Model methods CAN use Google Drive/Email if they receive `auth` as parameter and Controller orchestrates the call

### Controller.withAuth() Pattern
For Controllers needing Google API access:

```typescript
static async add(item: T, auth?: OAuth2Client): Promise<T> {
    return await this.withAuth(async (instance, authClient) => {
        await item.createFolder(authClient);
        await instance.repository.addInDb(item);
        return item;
    }, auth);
}
```

## Testing

### Test Structure
- Tests located in `__tests__/` directories within each module
- Global test setup: `src/__tests__/setup.ts`
- Configuration: `jest.config.js`

### Testing Philosophy
- **Unit tests**: Fast, isolated, mock all external dependencies
- Always mock: Database, External APIs, Other Controllers, File system
- Never mock: Business logic methods, Pure functions, Simple transformations

### Example
See `src/offers/__tests__/` for reference implementation.

## Database Guidelines

Detailed database architecture guidelines are in `docs/team/operations/db-changes.md`:
- Use read-only connections for schema analysis
- Check FK consistency, indexes, naming conventions
- MariaDB 10.6.x compatibility required
- Always verify connected database via logs before operations

## Code Style

### Prettier Configuration
```json
{
    "tabWidth": 4,
    "singleQuote": true
}
```

### Naming Conventions
- SQL WHERE clause builders: `makeAndConditions(searchParams)` pattern
- CRUD methods: `find()`, `addFromDto()`, `add()`, `editFromDto()`, `edit()`, `delete()`
- Validators: `{Entity}Validator` (e.g., `LetterValidator`)
- Type resolvers: `{Entity}TypeResolver` (e.g., `LetterTypeResolver`)

### Deprecated Patterns
- ❌ `addNew()` → use `addFromDto()` or `add()`
- ❌ `getList()` → use `find()`
- ❌ `new Model(req.body)` in Router → use `Controller.addFromDto(dto)`
- ❌ `instance.create()`, `instance.edit()`, `instance.delete()` → use `instance.repository.*InDb()`

## Critical Files

**Architecture (AI instructions - .github/instructions/):**
- `architektura.instructions.md` - Clean Architecture rules (MUST READ)
- `architektura-ai-assistant.md` - Decision trees and pattern recognition for AI
- `architektura-szczegoly.md` - Detailed architecture examples
- `architektura-testowanie.md` - Testing guidelines per layer
- `architektura-refactoring-audit.md` - Post-refactor audit checklist
- `refactoring-auth-pattern.md` - OAuth2 withAuth migration guide

**Operational (canonical docs - docs/team/):**
- `docs/team/README.md` - Documentation structure and change policy
- `docs/team/onboarding/environment.md` - Environment configuration (canonical)
- `docs/team/runbooks/testing.md` - Testing framework (canonical)
- `docs/team/operations/db-changes.md` - Database changes workflow (canonical)
- `docs/team/operations/post-change-checklist.md` - Required checks for DB/env/deploy

## Important Notes

### Security
- Never commit `.env`, `.env.development`, `.env.production` files
- Sensitive credentials: Google OAuth, SMTP, database passwords, KSeF tokens
- Session secret configured in environment variables

### Error Handling
- Global error handler in `src/index.ts`
- Automatic error reporting via `ToolsMail.sendServerErrorReport()`
- Uncaught exceptions and unhandled rejections are logged and reported

### Cron Jobs
- Weekly Scrum Sheet backup: Mondays at 5:00 AM
- Configured in `src/index.ts` using `node-cron`

### Multer File Uploads
- Memory storage configured globally
- Route-level middleware for multipart/form-data parsing
- 10MB limit for JSON and file uploads

## Factory: Review Process

Mapa źródeł prawdy: `factory/DOCS-MAP.md` — sprawdź ZANIM szukasz informacji o projekcie.

**ŻELAZNA ZASADA: Nie kończ zadania bez review.**

Po napisaniu lub zmodyfikowaniu kodu źródłowego:

1. Uruchom SUBAGENTA z promptem z `factory/prompts/reviewer.md`
2. Przekaż mu TYLKO zmienione pliki (git diff)
3. Subagent pracuje w IZOLOWANYM kontekście (fresh eyes)
4. Czekaj na VERDICT:
   - APPROVE → kontynuuj (commit / następny krok)
   - REQUEST_CHANGES →
     a) Napraw KAŻDY CRITICAL i HIGH
     b) Rozważ MEDIUM
     c) Ponów review
     d) Max 3 rundy → jeśli nadal CHANGES → zapytaj człowieka
5. WYJĄTKI (można pominąć review):
   - Zmiany TYLKO w plikach *.md (dokumentacja)
   - Zmiany TYLKO w factory/ (meta-narzędzia fabryki)

## Factory: Cross-Tool Adapter

Gdy pracujesz w trybie Dark Factory, stosuj wspolny adapter procesu:
- `factory/TOOL-ADAPTERS.md` (kanoniczny workflow multi-tool)
- `factory/adapters/codex.md` (skrot dla Codex)
- `factory/adapters/claude-code.md` (skrot dla Claude Code)
- `factory/adapters/copilot-vscode.md` (skrot dla Copilot w VS Code)

Context Gate v1 (Low-Context First):
- Start sesji tylko z Warstwa A:
  - `factory/CONCEPT.md`
  - `factory/TOOL-ADAPTERS.md`
  - `factory/prompts/reviewer.md`
- Warstwy B/C doladowuj selektywnie, nie domyslnie.
