# CLAUDE.md

PS-NodeJS: Express.js + TypeScript backend, Clean Architecture. MariaDB, Google Drive/Docs, MongoDB (sessions).

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

## Canonical Docs (read on demand, not by default)

**Architecture** (`documentation/team/architecture/`):
- `clean-architecture.md` — rules (MUST READ for any code task)
- `ai-decision-trees.md` — decision trees for AI
- `clean-architecture-details.md` — detailed examples
- `testing-per-layer.md` — testing per layer
- `refactoring-audit.md` — post-refactor checklist
- `auth-migration.md` — OAuth2 withAuth migration
- `conventions/coding-server.md` — server conventions
- `conventions/coding-client.md` — client conventions
- `system-map.md` — server-client system map

**Operational** (`documentation/team/`):
- `README.md` — doc structure and change policy
- `onboarding/environment.md` — environment setup
- `runbooks/testing.md` — testing framework
- `operations/db-changes.md` — DB changes workflow
- `operations/post-change-checklist.md` — post-change checks

## Factory: Review Process

Mapa źródeł prawdy: `documentation/team/operations/docs-map.md` — sprawdź ZANIM szukasz informacji o projekcie.

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

Commit po review/docs realizuj przez `factory/prompts/committer.md` i dopiero po jawnym `COMMIT_APPROVED` od orchestratora.

## Factory: Cross-Tool Adapter

Gdy pracujesz w trybie Dark Factory, stosuj wspolny adapter procesu:
- `factory/TOOL-ADAPTERS.md` (kanoniczny workflow multi-tool)
- `factory/adapters/codex.md` (skrot dla Codex)
- `factory/adapters/claude-code.md` (skrot dla Claude Code)
- `factory/adapters/copilot-vscode.md` (skrot dla Copilot w VS Code)

Context Gate v1 (Low-Context First):
- Start sesji z: `factory/CONCEPT.md`, `factory/TOOL-ADAPTERS.md`, `factory/prompts/reviewer.md`, `factory/prompts/planner.md`
- Canonical docs doładowuj selektywnie, nie domyślnie.
