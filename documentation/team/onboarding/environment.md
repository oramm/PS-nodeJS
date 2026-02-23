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

## KSeF visibility in logs

At startup, `loadEnv()` prints active KSeF runtime configuration:

- `KSEF_ENVIRONMENT` (`test` or `production`)
- Effective KSeF API base URL
- Marker `(override)` when `KSEF_API_BASE_URL` is set

Secrets are never printed (for example `KSEF_TOKEN`).

## Local helper for production KSeF

For local runs with production KSeF, you can keep test token in `KSEF_TOKEN`
and store production token in `KSEF_TOKEN_PRODUCTION`.

Runtime behavior:

- when `KSEF_ENVIRONMENT=production`
- loader uses `KSEF_TOKEN_PRODUCTION` when present
- if `KSEF_TOKEN_PRODUCTION` is missing, loader uses `KSEF_TOKEN`

This allows one-command local switch to production KSeF without pasting token each run.

## Database baseline

- Production: MariaDB 10.6.x on `envi-konsulting.kylos.pl`
- Local: MariaDB 10.6.x on `localhost`
- Keep local major version aligned with production (do not use 11.x/12.x locally).

## Adding a new environment variable

1. Add it to `.env.example`.
2. Update local/prod secret stores.
3. Document impact in `documentation/team/operations/post-change-checklist.md`.
4. Mention required actions in the PR template.
