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

Layer flow: `Router â†’ (Validator) â†’ Controller â†’ Repository â†’ Model`.
Controller manages DB transactions (NOT Repository). Validator is always a separate class.
Model MUST NOT import Controller/Repository or perform DB I/O. Repository MUST NOT contain business logic.
Standard CRUD: `find()`, `addFromDto()`, `add()`, `editFromDto()`, `edit()`, `delete()`
Base classes: `src/controllers/BaseController.ts` (Singleton, static methods, `withAuth()`), `src/repositories/BaseRepository.ts` (CRUD, `makeAndConditions()`)

Full rules: `documentation/team/architecture/clean-architecture.md`

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
Copy `.env.example` â†’ `.env.development`, fill `DB_PASSWORD`, run `yarn start`.
Full setup: `documentation/team/onboarding/local-setup.md`

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
â”śâ”€â”€ index.ts                      # Application entry point
â”śâ”€â”€ setup/
â”‚   â”śâ”€â”€ loadEnv.ts               # Environment variable loading (MUST use in entry points)
â”‚   â””â”€â”€ Sessions/
â”‚       â”śâ”€â”€ ToolsGapi.ts         # Google API authentication helper
â”‚       â””â”€â”€ Gauth2Routers.ts     # OAuth2 routes
â”śâ”€â”€ controllers/
â”‚   â””â”€â”€ BaseController.ts        # Base controller with Singleton pattern
â”śâ”€â”€ repositories/
â”‚   â””â”€â”€ BaseRepository.ts        # Base repository with CRUD operations
â”śâ”€â”€ tools/
â”‚   â”śâ”€â”€ ToolsDb.ts              # Database connection and query helpers
â”‚   â”śâ”€â”€ ToolsGd.ts              # Google Drive operations
â”‚   â”śâ”€â”€ ToolsEmail.ts           # Email operations
â”‚   â”śâ”€â”€ ToolsDocs.ts            # Google Docs operations
â”‚   â””â”€â”€ ToolsSheets.ts          # Google Sheets operations
â”śâ”€â”€ Admin/
â”‚   â”śâ”€â”€ Cities/                 # City entity (simple CRUD example)
â”‚   â””â”€â”€ ContractRanges/         # Contract ranges management
â”śâ”€â”€ contracts/                   # Contract management with milestones, cases, tasks
â”śâ”€â”€ invoices/                    # Invoice management with KSeF integration
â”śâ”€â”€ letters/                     # Letter management (polymorphic: Our/Incoming, Contract/Offer)
â”śâ”€â”€ offers/                      # Offer management with Google Drive integration
â”śâ”€â”€ projects/                    # Project management
â”śâ”€â”€ entities/                    # Business entity management
â”śâ”€â”€ persons/                     # Person and role management
â”śâ”€â”€ financialAidProgrammes/     # Financial aid programs, focus areas, application calls
â”śâ”€â”€ documentTemplates/          # Document template management
â””â”€â”€ types/                      # TypeScript type definitions
```

## Domain Modules

### Letters (Polymorphic Example)
- Hierarchy: `Letter` â†’ `OurLetter`/`IncomingLetter` â†’ `OurLetterContract`/`OurLetterOffer`/`IncomingLetterContract`/`IncomingLetterOffer`
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

Tests in `__tests__/` per module, config: `jest.config.js`, setup: `src/__tests__/setup.ts`.
Unit tests: mock DB/APIs/Controllers, never mock business logic. Example: `src/offers/__tests__/`.
Full guide: `documentation/team/runbooks/testing.md`

## Database Guidelines

MariaDB 10.6.x. Always verify `[ENV] DB target:` in logs before operations.
Full guide: `documentation/team/operations/db-changes.md`

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
- âťŚ `addNew()` â†’ use `addFromDto()` or `add()`
- âťŚ `getList()` â†’ use `find()`
- âťŚ `new Model(req.body)` in Router â†’ use `Controller.addFromDto(dto)`
- âťŚ `instance.create()`, `instance.edit()`, `instance.delete()` â†’ use `instance.repository.*InDb()`

## Critical Files

**Architecture (canonical - documentation/team/architecture/):**
- `clean-architecture.md` - Clean Architecture rules (MUST READ)
- `ai-decision-trees.md` - Decision trees and pattern recognition for AI
- `clean-architecture-details.md` - Detailed architecture examples
- `testing-per-layer.md` - Testing guidelines per layer
- `refactoring-audit.md` - Post-refactor audit checklist
- `auth-migration.md` - OAuth2 withAuth migration guide
- `conventions/coding-server.md` - Server coding conventions
- `conventions/coding-client.md` - Client coding conventions
- `system-map.md` - Server-client system map

**Operational (canonical docs - documentation/team/):**
- `documentation/team/README.md` - Documentation structure and change policy
- `documentation/team/onboarding/environment.md` - Environment configuration (canonical)
- `documentation/team/runbooks/testing.md` - Testing framework (canonical)
- `documentation/team/operations/db-changes.md` - Database changes workflow (canonical)
- `documentation/team/operations/post-change-checklist.md` - Required checks for DB/env/deploy

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

Mapa ĹşrĂłdeĹ‚ prawdy: `documentation/team/operations/docs-map.md` â€” sprawdĹş ZANIM szukasz informacji o projekcie.

**Ĺ»ELAZNA ZASADA: Nie koĹ„cz zadania bez review.**

Po napisaniu lub zmodyfikowaniu kodu ĹşrĂłdĹ‚owego:

1. Uruchom SUBAGENTA z promptem z `factory/prompts/reviewer.md`
2. PrzekaĹĽ mu TYLKO zmienione pliki (git diff)
3. Subagent pracuje w IZOLOWANYM kontekĹ›cie (fresh eyes)
4. Czekaj na VERDICT:
   - APPROVE â†’ kontynuuj (commit / nastÄ™pny krok)
   - REQUEST_CHANGES â†’
     a) Napraw KAĹ»DY CRITICAL i HIGH
     b) RozwaĹĽ MEDIUM
     c) PonĂłw review
     d) Max 3 rundy â†’ jeĹ›li nadal CHANGES â†’ zapytaj czĹ‚owieka
5. WYJÄ„TKI (moĹĽna pominÄ…Ä‡ review):
   - Zmiany TYLKO w plikach *.md (dokumentacja)
   - Zmiany TYLKO w factory/ (meta-narzÄ™dzia fabryki)

## Factory: Cross-Tool Adapter

Gdy pracujesz w trybie Dark Factory, stosuj wspolny adapter procesu:
- `factory/TOOL-ADAPTERS.md` (kanoniczny workflow multi-tool)
- `factory/adapters/codex.md` (skrot dla Codex)
- `factory/adapters/claude-code.md` (skrot dla Claude Code)
- `factory/adapters/copilot-vscode.md` (skrot dla Copilot w VS Code)

Context Gate v1 (Low-Context First):
- Start sesji z: `factory/CONCEPT.md`, `factory/TOOL-ADAPTERS.md`, `factory/prompts/reviewer.md`, `factory/prompts/planner.md`
- Canonical docs (`documentation/team/architecture/`, `documentation/team/runbooks/`, `documentation/team/operations/`) doladowuj selektywnie, nie domyslnie.
