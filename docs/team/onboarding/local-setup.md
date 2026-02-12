# Local Setup

## Prerequisites

- Node.js and Yarn
- MariaDB 10.6.x
- SQL dump for local bootstrap

## Setup steps

1. Create DB:
   `CREATE DATABASE envikons_myEnvi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
2. Import dump:
   `mysql -u root -p envikons_myEnvi < full_dump.sql`
3. Copy `.env.example` to `.env.development`.
4. Fill local secrets (minimum: `DB_PASSWORD` and other required vars).
5. Start app with `yarn start`.
6. Confirm logs show local target:
   `[ENV] DB target: localhost/envikons_myEnvi`

## Recommended tools

- HeidiSQL for DB browsing

## Common issues

- `ECONNREFUSED 127.0.0.1:3306`: local MariaDB is not running.
- App points to production on local start: missing or invalid `.env.development`.
