# Dev Login Runbook

## Purpose

Enable mock login flow for local development and test automation while blocking it outside development.

## Backend behavior

The login handler accepts optional request payload fields:

- `dev_mode: true`
- `mock_user: string` (optional)

When `dev_mode === true`, backend allows bypass only if both conditions are met:

- `NODE_ENV === development`
- `ENABLE_DEV_LOGIN === true`

Otherwise it returns `401` with:
`Dev mode login is not allowed in this environment`.

## Required environment

Development:

```bash
NODE_ENV=development
ENABLE_DEV_LOGIN=true
```

Production:

```bash
NODE_ENV=production
ENABLE_DEV_LOGIN=false
```

## Example request

```ts
await fetch('http://localhost:3000/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    dev_mode: true,
    mock_user: 'Playwright Test User',
  }),
});
```

## Verification

1. In local dev, request succeeds and session contains mock user data.
2. In production profile, the same request fails with `401`.

## Troubleshooting

- If request is rejected locally, verify both `NODE_ENV` and `ENABLE_DEV_LOGIN`.
- If session is missing, verify backend session middleware and frontend `credentials: 'include'`.
