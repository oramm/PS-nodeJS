# Access And Secrets

## Principles

1. Never commit credentials, tokens, or personal data.
2. Keep `.env.example` as the public contract, without real secrets.
3. Use environment-specific secret storage for production values.

## Minimum local secret flow

1. Start from `.env.example`.
2. Create `.env.development`.
3. Fill private values locally.
4. Restart app after env changes.

## Production secret flow (Heroku)

1. Set config vars in Heroku app settings.
2. Keep key names aligned with `.env.example`.
3. Document any new key in:
   - `docs/team/onboarding/environment.md`
   - `docs/team/operations/post-change-checklist.md`

## Access governance

- Grant minimum necessary access to databases and cloud services.
- Prefer read-only access for analysis tasks unless write is explicitly required.
- Rotate sensitive credentials after incidents or planned access changes.
