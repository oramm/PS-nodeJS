# Environment Configuration

This file is the source of truth for local vs production environment behavior.

## Loading order

`src/setup/loadEnv.ts` loads variables in this order:

1. `.env` (shared defaults)
2. `.env.{NODE_ENV}` with override enabled

Default environment is `production`. If `NODE_ENV` is missing, production values are used.

## Required rule for entry points

Every new entry point or script must use:

```ts
import { loadEnv } from './setup/loadEnv';
loadEnv();
```

Do not use direct `dotenv.config()` in new code.

## Env files

- `.env`: shared configuration (not committed)
- `.env.development`: local environment (not committed)
- `.env.production`: production environment values (not committed)
- `.env.example`: committed template used as contract

## Scripts and target DB

- `yarn start`: `NODE_ENV=development`, local DB
- `yarn debug`: `NODE_ENV=development`, local DB
- `yarn start:prod`: production DB target

## Database baseline

- Production: MariaDB 10.6.x on `envi-konsulting.kylos.pl`
- Local: MariaDB 10.6.x on `localhost`
- Keep local major version aligned with production (do not use 11.x/12.x locally).

## Adding a new environment variable

1. Add it to `.env.example`.
2. Update local/prod secret stores.
3. Document impact in `docs/team/operations/post-change-checklist.md`.
4. Mention required actions in the PR template.
