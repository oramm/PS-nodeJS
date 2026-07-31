# Bug Backlog Module Runbook

## Purpose

This runbook explains how to use the runtime bug backlog module end-to-end:

1. collect frontend and backend runtime errors,
2. inspect backlog,
3. prepare one-bug fix context,
4. optionally sync triaged bugs to GitHub,
5. archive old resolved bugs.

## What this module does

The module stores runtime errors in a single backlog (DB), deduplicates similar errors by fingerprint, and lets the team run a repeatable fix loop.

Typical outputs:

1. JSON scan output for open bugs,
2. daily inbox JSON file,
3. per-bug context file for repair iteration,
4. optional GitHub issue links,
5. retention cleanup logs.

## Command reference

If scripts are available in package scripts, use:

1. `yarn bugfix:scan --top 20 --statuses "new,triaged"`
2. `yarn bugfix:run --top 1 --mode analyze+patch --out tmp/bug-context.json`
3. `yarn bugfix:daily-inbox --top 10`
4. `yarn bugfix:sync-github --dry-run --top 5`
5. `yarn bugfix:sync-github --top 5`
6. `yarn bugfix:retention --months 6`

If a command is missing, see "When commands do not exist".

## Standard workflow

### 1. Confirm backend ingest is enabled

Required env toggles:

1. `BUG_CLIENT_ERROR_ENABLED=true`
2. `BUG_CLIENT_ERROR_ALLOW_SESSION=true` (recommended automatic mode)
3. `BUG_CLIENT_ERROR_SECRET=...` (fallback for non-session clients)

### 2. Trigger or wait for runtime errors

Sources:

1. backend middleware/process hooks,
2. frontend global error handlers,
3. frontend repository request errors.

### 3. Inspect current queue

Run:

1. `yarn bugfix:scan --top 20 --statuses "new,triaged"`

Expected:

1. JSON with `generatedAt`, `count`, `bugs`.

### 4. Create one-bug fix package

Run:

1. `yarn bugfix:run --top 1 --mode analyze+patch --out tmp/bug-context.json`

Use this file as the single input for one repair iteration.

### 5. Apply and verify fix

1. Implement fix for selected bug only.
2. Reproduce scenario.
3. Run scan again and verify fingerprint does not keep growing.

### 6. Optional GitHub sync

1. Start dry-run:
   `yarn bugfix:sync-github --dry-run --top 5`
2. Then real sync:
   `yarn bugfix:sync-github --top 5`

### 7. Retention cleanup

1. `yarn bugfix:retention --months 6`

## What is ready but may not work until enabled

1. Frontend automatic reporting is ready, but requires either:
   session-auth on `/client-error`, or valid secret auth.
2. GitHub sync is ready, but requires:
   `BUG_GITHUB_SYNC_ENABLED=true`, repo slug and token.
3. Cron jobs are implemented, but disabled by default.
4. Admin read model endpoint exists, but disabled by default and requires admin session plus secret.

## What to configure so it works

### Minimum (DB and ingest)

1. `DB_HOST`
2. `DB_USER`
3. `DB_PASSWORD`
4. `DB_NAME`
5. `BUG_CLIENT_ERROR_ENABLED=true`
6. `BUG_CLIENT_ERROR_ALLOW_SESSION=true`

### Optional (GitHub)

1. `BUG_GITHUB_SYNC_ENABLED=true`
2. `BUG_GITHUB_REPO=owner/repo`
3. `BUG_GITHUB_TOKEN=...`

### Optional (cron)

1. `BUGFIX_DAILY_INBOX_CRON_ENABLED=true`
2. `BUGFIX_RETENTION_CRON_ENABLED=true`
3. `BUGFIX_RETENTION_MONTHS=6`

## Troubleshooting

### 403 on `/client-error`

Means request is not authorized.

Check:

1. user session exists and `BUG_CLIENT_ERROR_ALLOW_SESSION=true`, or
2. secret header matches `BUG_CLIENT_ERROR_SECRET`.

### Scan returns `count: 0`

Possible reasons:

1. no events were sent,
2. wrong statuses filter,
3. ingest disabled,
4. DB mismatch.

Try broader filter:

1. `yarn bugfix:scan --top 50 --statuses "new,triaged,fixed,ignored,in_progress,waiting_human"`

### Access denied for DB user

Check DB env values and local DB account permissions.

### Commands fail because scripts do not exist

This means current branch does not include module wiring yet.

Required integration artifacts usually include:

1. bug events domain files under `src/bugEvents/`,
2. bugfix scripts under `src/scripts/`,
3. package scripts `bugfix:*`,
4. backend route `/client-error`.

## Quick smoke test

1. Start backend in development.
2. Trigger one frontend error.
3. Run `yarn bugfix:scan --top 10 --statuses "new,triaged"`.
4. Confirm one item appears.
5. Run `yarn bugfix:run --top 1 --mode analyze+patch --out tmp/bug-context.json`.
