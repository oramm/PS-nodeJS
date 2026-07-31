# CLAUDE.md

PS-NodeJS: Express.js + TypeScript backend, Clean Architecture. MariaDB, Google Drive/Docs, MongoDB (sessions).
Frontend to osobne repo: `C:\Apache24\htdocs\ENVI.ProjectSite`.

## Development Commands

```bash
yarn install          # Install dependencies
yarn start            # Dev server (localhost DB)
yarn start:prod       # Production DB - DO NOT USE LOCALLY
yarn debug            # Debug with inspector
yarn build            # Build TypeScript
yarn test             # Run all tests
yarn test:watch       # Watch mode
yarn test:coverage    # Coverage
yarn test:offers      # Specific module
yarn check:cycles     # Circular dependency check
```

## Architecture: Clean Architecture (Critical)

Layer flow: `Router → (Validator) → Controller → Repository → Model`.
Controller manages DB transactions (NOT Repository). Validator is always a separate class.
Model MUST NOT import Controller/Repository or perform DB I/O. Repository MUST NOT contain business logic.
Standard CRUD: `find()`, `addFromDto()`, `add()`, `editFromDto()`, `edit()`, `delete()`
Base classes: `src/controllers/BaseController.ts` (Singleton, static methods, `withAuth()`), `src/repositories/BaseRepository.ts` (CRUD, `makeAndConditions()`)

Full rules: `documentation/team/architecture/clean-architecture.md`

### Deprecated Patterns (MUST NOT use in new code)

- ❌ `addNew()` → use `addFromDto()` or `add()`
- ❌ `getList()` → use `find()`
- ❌ `new Model(req.body)` in Router → use `Controller.addFromDto(dto)`
- ❌ `instance.create()`, `instance.edit()`, `instance.delete()` → use `instance.repository.*InDb()`
- ❌ `ToolsGapi.gapiReguestHandler` in new Routers → use `BaseController.withAuth()` (legacy calls tolerated where they already exist)

## Database conventions (ToolsDb)

- Column names start with an uppercase letter; `Id` is auto-increment.
- Object fields prefixed with `_` are skipped in SQL.
- Schema changes go in stages: migration → transition period → removal of the old shape. Keep backward compatibility until the migration is finished.

## Environment & Database (Critical)

- Uses `src/setup/loadEnv.ts` — ALWAYS import and call `loadEnv()` at top of entry points
- **Default environment: production** (no `NODE_ENV` = production database on kylos)
- **IMPORTANT**: Always check logs `[ENV] DB target:` to verify which database is connected
- MariaDB via `mysql2/promise`, connection pooling in `src/tools/ToolsDb.ts`
- Never commit `.env`, `.env.development`, `.env.production`
- Quick start: copy `.env.example` → `.env.development`, fill `DB_PASSWORD`, run `yarn start`

## Code Style

Prettier: `tabWidth: 4`, `singleQuote: true`
Naming: `makeAndConditions(searchParams)`, `{Entity}Validator`, `{Entity}TypeResolver`

## Testing

Tests in `__tests__/` per module. Mock DB/APIs/Controllers, never mock business logic.
Full guide: `documentation/team/runbooks/testing.md`

## Docs (read on demand, not by default)

Kod i baza sa zrodlem prawdy o tym, jak system dziala. Dokumentacja opisuje reguly, decyzje
i procedury operacyjne, ktorych z kodu nie widac.

- `documentation/team/architecture/clean-architecture.md` — reguly warstw (MUST READ dla zadan kodowych)
- `documentation/team/architecture/testing-per-layer.md` — co mockowac na ktorej warstwie
- `documentation/team/architecture/system-context.md` — diagram kontekstu (C4)
- `documentation/team/onboarding/environment.md` — srodowiska i `.env`
- `documentation/team/operations/db-changes.md` — workflow zmian DB
- `documentation/team/operations/post-change-checklist.md` — wpis po zmianie DB/env/deploy
- `documentation/team/runbooks/` — testy, dev-login, migracje, lokalny dev, bug backlog
