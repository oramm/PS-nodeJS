# Mapa Dokumentacji - Zrodla Prawdy (S.O.T.)

> Dla kazdej kategorii wskazane jest zrodlo prawdy (S.O.T.) oraz pliki pomocnicze.
> Aktualizacja: 2026-02-20
> Koncepcja fabryki: `factory/CONCEPT.md`
> Diagramy koncepcji: `factory/CONCEPT-DIAGRAMS.md`

---

## 1. Architektura systemu

| Rola | Plik |
|---|---|
| **S.O.T.** | `.github/instructions/architektura.instructions.md` |
| Podsumowanie | `CLAUDE.md` (sekcja Architecture: Clean Architecture) |
| Drzewa decyzyjne AI | `.github/instructions/architektura-ai-assistant.md` |
| Szczegoly i przyklady | `.github/instructions/architektura-szczegoly.md` |
| Mapa serwer-klient | `factory/SYSTEM-MAP.md` |

---

## 2. Konwencje kodowania - serwer

| Rola | Plik |
|---|---|
| **S.O.T.** | `factory/AUDIT-SERVER.md` (sekcja Konwencje kodowania) |
| Reguly architektoniczne | `.github/instructions/architektura.instructions.md` |
| Deprecated patterns | `CLAUDE.md` |
| Styl kodu | `CLAUDE.md` + konfiguracja formattera/lintera |

---

## 3. Konwencje kodowania - klient

| Rola | Plik |
|---|---|
| **S.O.T.** | `factory/AUDIT-CLIENT.md` (sekcja Konwencje kodowania) |
| Instrukcje AI klienta | `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\` (osobne repo) |

---

## 4. API contract (serwer <-> klient)

| Rola | Plik |
|---|---|
| **S.O.T.** | `factory/SYSTEM-MAP.md` (sekcja mapa endpointow) |
| Audyt serwera | `factory/AUDIT-SERVER.md` (API Surface) |
| Typy klienta | `C:\Apache24\htdocs\ENVI.ProjectSite\Typings\bussinesTypes.d.ts` |
| Typy serwera | `src/types/types.d.ts` |

Uwagi:
- Typy sa utrzymywane recznie w 2 repozytoriach (ryzyko dryfu).

---

## 5. Konfiguracja, setup, deployment

| Rola | Plik |
|---|---|
| **S.O.T. (env)** | `docs/team/onboarding/environment.md` |
| **S.O.T. (deploy)** | `docs/team/operations/deployment-heroku.md` |
| **S.O.T. (DB changes)** | `docs/team/operations/db-changes.md` |
| Quick start | `CLAUDE.md` |
| Local setup | `docs/team/onboarding/local-setup.md` |
| Secrets | `docs/team/onboarding/access-and-secrets.md` |
| Dev login | `docs/team/runbooks/dev-login.md` |
| Env template | `.env.example` |
| Post-change checklist | `docs/team/operations/post-change-checklist.md` |

Redirecty:
- `ENVIRONMENT.md` -> `docs/team/onboarding/environment.md`
- `DEV-LOGIN-SETUP.md` -> `docs/team/runbooks/dev-login.md`
- `AGENT_DB_GUIDELINES.md` -> `docs/team/operations/db-changes.md`

---

## 6. Testowanie

| Rola | Plik |
|---|---|
| **S.O.T.** | `docs/team/runbooks/testing.md` |
| Wytyczne per warstwa | `.github/instructions/architektura-testowanie.md` |
| Podsumowanie | `CLAUDE.md` (sekcja Testing) |

Redirecty:
- `TESTING.md` -> `docs/team/runbooks/testing.md`
- `TESTING-QUICKSTART.md` -> `docs/team/runbooks/testing.md`
- `TESTING-SUMMARY.md` -> `docs/team/runbooks/testing.md`

---

## 7. Reguly pracy agenta AI

| Rola | Plik |
|---|---|
| **S.O.T.** | `CLAUDE.md` |
| Reguly agentow | `AGENTS.md` |
| Copilot (VS Code) | `.github/copilot-instructions.md` |
| Drzewa decyzyjne | `.github/instructions/architektura-ai-assistant.md` |
| Refactoring audit | `.github/instructions/architektura-refactoring-audit.md` |
| Auth migration | `.github/instructions/refactoring-auth-pattern.md` |
| DB architect agent | `.github/agents/DB architect.agent.md` |
| Skills | `.agents/skills/*.md` |
| Review process | `factory/prompts/reviewer.md` |
| Koncepcja fabryki | `factory/CONCEPT.md` |

---

## 8. Dokumentacja projektowa (plan/progress/log)

| Modul | Plan | Postep | Activity log |
|---|---|---|---|
| Contract Meeting Notes | `docs/team/operations/contract-meeting-notes/plan.md` | `docs/team/operations/contract-meeting-notes/progress.md` | `docs/team/operations/contract-meeting-notes/activity-log.md` |
| Persons v2 refactor | `docs/team/operations/persons-v2-refactor-plan.md` | `docs/team/operations/persons-v2-refactor-progress.md` | - |
| HR module | `docs/team/operations/hr-module-plan.md` | `docs/team/operations/hr-module-progress.md` | - |
| Profile import | - | `docs/team/operations/profile-import-progress.md` | - |

Uwaga:
- W module Contract Meeting Notes preferowane sa nowe pliki w katalogu `contract-meeting-notes/`.

---

## 9. Factory (meta-narzedzia)

| Plik | Opis |
|---|---|
| `factory/STATUS.md` | Aktualny status budowy fabryki |
| `factory/CONCEPT.md` | Kanoniczny opis koncepcji Dark Factory |
| `factory/CONCEPT-DIAGRAMS.md` | Diagramy koncepcji (human-friendly) |
| `factory/TOOL-ADAPTERS.md` | Wspolny adapter workflow dla narzedzi |
| `factory/templates/task-plan-context.yaml` | Szablon planu taska (required/optional context + budget) |
| `factory/adapters/codex.md` | Adapter sesji dla Codex |
| `factory/adapters/claude-code.md` | Adapter sesji dla Claude Code |
| `factory/adapters/copilot-vscode.md` | Adapter sesji dla Copilot VS Code |
| `factory/PROMPTS-SESSIONS.md` | Prompty na kolejne sesje |
| `factory/AUDIT-SERVER.md` | Audyt serwera |
| `factory/AUDIT-CLIENT.md` | Audyt klienta |
| `factory/SYSTEM-MAP.md` | Mapa serwer-klient |
| `factory/DOCS-MAP.md` | Ten plik (mapa S.O.T.) |
| `factory/prompts/reviewer.md` | Prompt reviewera AI |

---

## Polityka dokumentacji

Zrodlo: `docs/team/README.md`
- Kanoniczne dokumenty operacyjne zyja w `docs/team/`.
- Root-level `.md` powinny byc redirectami, nie duplikatami.
- Zmiany architektoniczne trafiaja do `.github/instructions/`.
- Zmiany procesowe trafiaja do `docs/team/operations/`.
