---
name: ui-browser-loop
description: Browser automation and UI verification for ENVI.ProjectSite frontend using Puppeteer; use when testing page rendering, taking screenshots, verifying UI elements, mocking login flows, or validating frontend behavior from the backend workspace.
---

# UI Browser Loop

To jest cienki cross-repo skill dla zadan frontendowych prowadzonych z workspace `PS-nodeJS`.

Istnieje w tym repo celowo, bo agenci sa zwykle uruchamiani z backendowego workspace; ten skill jest entrypointem, a kanoniczne zasady pozostaja po stronie `ENVI.ProjectSite`.

## Obowiązkowe pliki — przeczytaj na starcie:

1. `C:\Apache24\htdocs\PS-nodeJS\.github\instructions\client-guidelines.instructions.md`
2. `C:\Apache24\htdocs\ENVI.ProjectSite\CLAUDE.md`
3. `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\AI_GUIDELINES.md`
4. `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\ui-browser-loop.md`

## Ustalony kontekst środowiska

- frontend działa pod `http://localhost:9000/docs/#/...`
- frontend na localhost używa backendu `http://localhost:3000`
- używaj `ENABLE_DEV_LOGIN=true` oraz backendowego `dev_mode: true`
- `scripts/screenshot.js` wspiera `--mock-login`, `--timeout`, `--viewport`, `--selector`, `--text`
- zrzuty trafiają do `ENVI.ProjectSite\tmp\ui-browser-loop\` i muszą być usunięte po weryfikacji
- gdy port `9000` lub `3000` jest zajęty, najpierw sprawdź, czy serwery już działają

## Zasada adaptera

Pliki instrukcji dla narzędzi muszą być zwięzłe i wskazywać na dokumenty kanoniczne, bez duplikowania długich treści operacyjnych.
