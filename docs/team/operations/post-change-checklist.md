# Post Change Checklist

Use this file for every change that impacts DB, environment variables, or deployment.

## Template

Copy the block below for each change:

```md
## YYYY-MM-DD - <short-title>

### 1. Scope
- <what changed>

### 2. DB impact
- <none | details of schema/data/migration changes>

### 3. ENV impact
- `.env.example`: <updated/not-needed>
- New/changed variables: <list>

### 4. Heroku impact
- Config vars: <required/not-required>
- Restart/release steps: <steps>

### 5. Developer actions
- <e.g. yarn install, migrations, rebuild>

### 6. Verification
- <how to verify locally/prod>

### 7. Rollback
- <rollback steps>

### 8. Owner
- <person/team>
```

## Entries

## 2026-02-08 - Team docs canonical model rollout

### 1. Scope
- Introduced canonical operational docs under `docs/team/*`.
- Added tool adapters (`AGENTS.md`, `.github/instructions`, PR template).

### 2. DB impact
- None.

### 3. ENV impact
- `.env.example`: not changed.
- New/changed variables: none.

### 4. Heroku impact
- Config vars: not required.
- Restart/release steps: none.

### 5. Developer actions
- Use `docs/team/*` as canonical source for operational documentation.

### 6. Verification
- Check references and links from root stubs and tool adapter files.

### 7. Rollback
- Revert commit containing docs migration.

### 8. Owner
- Platform/docs maintainers.
