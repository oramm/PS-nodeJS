---
applyTo: '**/*.ts'
description: 'Environment adapter: technical rules + canonical source mapping | Version: 2.0'
---

# Konfiguracja srodowisk (adapter)

Source of truth:
`docs/team/onboarding/environment.md`

Ten plik jest adapterem Copilot i zawiera tylko reguly techniczne.
Pelna dokumentacja operacyjna musi byc utrzymywana w `docs/team/*`.

## Twarde reguly techniczne

1. Kazdy nowy entry point/skrypt musi uruchamiac `loadEnv()`.
2. Nie uzywaj bezposrednio `dotenv.config()` w nowym kodzie.
3. Traktuj brak `NODE_ENV` jako `production`.
4. Zmiany env wymagaja aktualizacji `.env.example`.
5. Zmiany DB/env/deploy wymagaja wpisu w:
   `docs/team/operations/post-change-checklist.md`.

## Szybka mapa

- Onboarding setup: `docs/team/onboarding/local-setup.md`
- Environment source: `docs/team/onboarding/environment.md`
- Access/secrets: `docs/team/onboarding/access-and-secrets.md`
- Deployment: `docs/team/operations/deployment-heroku.md`
