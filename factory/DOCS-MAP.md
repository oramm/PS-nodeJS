# Mapa Dokumentacji — Źródła Prawdy

> Dla każdej kategorii wskazane jest ŹRÓDŁO PRAWDY (S.O.T.) i pliki pomocnicze.
> Aktualizacja: 2026-02-20

---

## 1. Architektura systemu

| Rola | Plik |
|------|------|
| **S.O.T.** | `.github/instructions/architektura.instructions.md` (536 LOC, reguły Clean Architecture) |
| Podsumowanie | `CLAUDE.md` sekcja "Architecture: Clean Architecture" |
| Drzewa decyzyjne AI | `.github/instructions/architektura-ai-assistant.md` |
| Szczegółowe przykłady | `.github/instructions/architektura-szczegoly.md` |
| Mapa serwer↔klient | `factory/SYSTEM-MAP.md` |

**Rozbieżności:** Brak — `CLAUDE.md` jest skrótem `architektura.instructions.md`, spójne.

---

## 2. Konwencje kodowania — serwer

| Rola | Plik |
|------|------|
| **S.O.T.** | `factory/AUDIT-SERVER.md` sekcja 4 "Konwencje kodowania" |
| Reguły architektoniczne | `.github/instructions/architektura.instructions.md` |
| Deprecated patterns | `CLAUDE.md` sekcja "Deprecated Patterns" |
| Styl kodu | `CLAUDE.md` sekcja "Code Style" (Prettier config) |

---

## 3. Konwencje kodowania — klient

| Rola | Plik |
|------|------|
| **S.O.T.** | `factory/AUDIT-CLIENT.md` sekcja 4 "Konwencje kodowania" |
| Instrukcje AI klienta | `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\` (osobne repo) |

---

## 4. API contract (serwer ↔ klient)

| Rola | Plik |
|------|------|
| **S.O.T.** | `factory/SYSTEM-MAP.md` sekcja 3 "Mapa endpointów" |
| Audyt serwera (endpointy) | `factory/AUDIT-SERVER.md` sekcja 6 "API Surface" |
| Typy klienta | `C:\Apache24\htdocs\ENVI.ProjectSite\Typings\bussinesTypes.d.ts` |
| Typy serwera | `src/types/types.d.ts` |

**Rozbieżności:** Typy utrzymywane ręcznie w dwóch repozytoriach — brak shared package. Ryzyko dryfu.

---

## 5. Konfiguracja / setup / deployment

| Rola | Plik |
|------|------|
| **S.O.T. (env)** | `docs/team/onboarding/environment.md` |
| **S.O.T. (deploy)** | `docs/team/operations/deployment-heroku.md` |
| **S.O.T. (DB changes)** | `docs/team/operations/db-changes.md` |
| Quick start | `CLAUDE.md` sekcja "Quick Start for New Developers" |
| Local setup | `docs/team/onboarding/local-setup.md` |
| Secrets | `docs/team/onboarding/access-and-secrets.md` |
| Dev login | `docs/team/runbooks/dev-login.md` |
| Env template | `.env.example` |
| Post-change checklist | `docs/team/operations/post-change-checklist.md` |

**Redirecty (nie S.O.T., tylko linki):**
- `ENVIRONMENT.md` → `docs/team/onboarding/environment.md`
- `DEV-LOGIN-SETUP.md` → `docs/team/runbooks/dev-login.md`
- `AGENT_DB_GUIDELINES.md` → `docs/team/operations/db-changes.md`

---

## 6. Testowanie

| Rola | Plik |
|------|------|
| **S.O.T.** | `docs/team/runbooks/testing.md` |
| Wytyczne per warstwa | `.github/instructions/architektura-testowanie.md` |
| Podsumowanie | `CLAUDE.md` sekcja "Testing" |

**Redirecty:**
- `TESTING.md`, `TESTING-QUICKSTART.md`, `TESTING-SUMMARY.md` → wszystkie do `docs/team/runbooks/testing.md`

---

## 7. Reguły pracy agenta AI

| Rola | Plik |
|------|------|
| **S.O.T.** | `CLAUDE.md` (czytany automatycznie przy każdym zadaniu) |
| Reguły agentów | `AGENTS.md` |
| Drzewa decyzyjne | `.github/instructions/architektura-ai-assistant.md` |
| Refactoring audit | `.github/instructions/architektura-refactoring-audit.md` |
| Auth migration | `.github/instructions/refactoring-auth-pattern.md` |
| DB architect agent | `.github/agents/DB architect.agent.md` |
| Skills | `.agents/skills/db-schema-snapshot-mariadb.md`, `.agents/skills/persons-v2-migration.md`, `.agents/skills/refactoring-audit.md` |
| Review process | `factory/prompts/reviewer.md` |

---

## 8. Dokumentacja projektowa (plany, postępy)

| Moduł | Plan | Postęp | Activity Log |
|-------|------|--------|--------------|
| Contract Meeting Notes | `docs/team/operations/contract-meeting-notes/plan.md` | `docs/team/operations/contract-meeting-notes/progress.md` | `docs/team/operations/contract-meeting-notes/activity-log.md` |
| Persons v2 refactor | `docs/team/operations/persons-v2-refactor-plan.md` | `docs/team/operations/persons-v2-refactor-progress.md` | — |
| HR module | `docs/team/operations/hr-module-plan.md` | `docs/team/operations/hr-module-progress.md` | — |
| Profile import | — | `docs/team/operations/profile-import-progress.md` | — |

**Uwaga:** Contract Meeting Notes ma STARE pliki (`operations/contract-meeting-notes-*.md`) I NOWE (`operations/contract-meeting-notes/*.md`). Nowe są aktualniejsze.

---

## 9. Factory (meta-narzędzia)

| Plik | Opis |
|------|------|
| `factory/STATUS.md` | Aktualny stan budowy fabryki |
| `factory/PROMPTS-SESSIONS.md` | Prompty na kolejne sesje |
| `factory/AUDIT-SERVER.md` | Audyt serwera |
| `factory/AUDIT-CLIENT.md` | Audyt klienta |
| `factory/SYSTEM-MAP.md` | Mapa serwer↔klient |
| `factory/DOCS-MAP.md` | Ten plik |
| `factory/prompts/reviewer.md` | Prompt reviewera AI |

---

## Polityka dokumentacji

Źródło: `docs/team/README.md`
- Kanoniczne dokumenty żyją w `docs/team/`
- Root-level MD to redirecty (nie duplikuj treści)
- Zmiany w architekturze → `.github/instructions/`
- Zmiany w procesach → `docs/team/operations/`
