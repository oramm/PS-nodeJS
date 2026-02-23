# Mapa Dokumentacji - Zrodla Prawdy (S.O.T.)

> Dla kazdej kategorii wskazane jest zrodlo prawdy (S.O.T.) oraz pliki pomocnicze.
> Aktualizacja: 2026-02-23
> Koncepcja fabryki: `factory/CONCEPT.md`
> Diagramy koncepcji: `factory/CONCEPT-DIAGRAMS.md`
> Konwencja sciezek: backend (`PS-nodeJS`) jako sciezki repo-relative, frontend (`ENVI.ProjectSite`) jako sciezki absolutne Windows.

## Model 3 warstw

| Warstwa | Nazwa | Lokalizacja | Zawiera |
|---------|-------|-------------|---------|
| Canonical | Wiedza projektowa (S.O.T.) | `documentation/team/` | architecture/, onboarding/, runbooks/, operations/ |
| Adaptery | Adaptery narzedziowe | `.github/instructions/`, `CLAUDE.md`, `AGENTS.md`, `.claude/` | Konfiguracja narzedzi AI linkujaca do canonical |
| Factory | Meta-narzedzia AI | `factory/` | prompty, adaptery sesji, koncepcja, status |

Uwaga: Typy (`src/types/types.d.ts`, `Typings/bussinesTypes.d.ts`) to kod, nie dokumentacja â€” wymienione w sekcji API contract.

---

## 1. Architektura systemu

| Rola                  | Plik                                                  |
| --------------------- | ----------------------------------------------------- |
| **S.O.T.**            | `documentation/team/architecture/clean-architecture.md`        |
| Adapter (Copilot)     | `.github/instructions/architektura.instructions.md` (sync copy) |
| Podsumowanie          | `CLAUDE.md` (sekcja Architecture: Clean Architecture) |
| Drzewa decyzyjne AI   | `documentation/team/architecture/ai-decision-trees.md`         |
| Szczegoly i przyklady | `documentation/team/architecture/clean-architecture-details.md` |
| Mapa serwer-klient    | `documentation/team/architecture/system-map.md`                |

---

## 2. Konwencje kodowania - serwer

| Rola                    | Plik                                                        |
| ----------------------- | ----------------------------------------------------------- |
| **S.O.T.**              | `documentation/team/architecture/conventions/coding-server.md`       |
| Reguly architektoniczne | `documentation/team/architecture/clean-architecture.md`              |
| Deprecated patterns     | `CLAUDE.md`                                                 |
| Styl kodu               | `CLAUDE.md` + konfiguracja formattera/lintera               |

---

## 3. Konwencje kodowania - klient

| Rola                  | Plik                                                              |
| --------------------- | ----------------------------------------------------------------- |
| **S.O.T.**            | `documentation/team/architecture/conventions/coding-client.md`             |
| Instrukcje AI klienta | `C:\Apache24\htdocs\ENVI.ProjectSite\instructions\` (osobne repo) |

---

## 4. API contract (serwer <-> klient)

| Rola          | Plik                                                             |
| ------------- | ---------------------------------------------------------------- |
| **S.O.T.**    | `documentation/team/architecture/system-map.md` (sekcja mapa endpointow) |
| Typy klienta  | `C:\Apache24\htdocs\ENVI.ProjectSite\Typings\bussinesTypes.d.ts` |
| Typy serwera  | `src/types/types.d.ts`                                           |

Uwagi:

- Typy sa utrzymywane recznie w 2 repozytoriach (ryzyko dryfu).

---

## 5. Konfiguracja, setup, deployment

| Rola                    | Plik                                            |
| ----------------------- | ----------------------------------------------- |
| **S.O.T. (env)**        | `documentation/team/onboarding/environment.md`           |
| **S.O.T. (deploy)**     | `documentation/team/operations/deployment-heroku.md`     |
| **S.O.T. (DB changes)** | `documentation/team/operations/db-changes.md`            |
| Quick start             | `CLAUDE.md`                                     |
| Local setup             | `documentation/team/onboarding/local-setup.md`           |
| Secrets                 | `documentation/team/onboarding/access-and-secrets.md`    |
| Dev login               | `documentation/team/runbooks/dev-login.md`               |
| Env template            | `.env.example`                                  |
| Post-change checklist   | `documentation/team/operations/post-change-checklist.md` |

Historyczne aliasy root-level usuniete (2026-02-23):

- `ENVIRONMENT.md` -> `documentation/team/onboarding/environment.md`
- `DEV-LOGIN-SETUP.md` -> `documentation/team/runbooks/dev-login.md`
- `AGENT_DB_GUIDELINES.md` -> `documentation/team/operations/db-changes.md`

---

## 6. Testowanie

| Rola                 | Plik                                              |
| -------------------- | ------------------------------------------------- |
| **S.O.T.**           | `documentation/team/runbooks/testing.md`                   |
| Wytyczne per warstwa | `documentation/team/architecture/testing-per-layer.md`     |
| Podsumowanie         | `CLAUDE.md` (sekcja Testing)                      |

Historyczne aliasy root-level usuniete (2026-02-23):

- `TESTING.md` -> `documentation/team/runbooks/testing.md`
- `TESTING-QUICKSTART.md` -> `documentation/team/runbooks/testing.md`
- `TESTING-SUMMARY.md` -> `documentation/team/runbooks/testing.md`

---

## 7. Reguly pracy agenta AI

| Rola               | Plik                                                     |
| ------------------ | -------------------------------------------------------- |
| **S.O.T.**         | `CLAUDE.md`                                              |
| Reguly agentow     | `AGENTS.md`                                              |
| Copilot (VS Code)  | `.github/copilot-instructions.md`                        |
| Drzewa decyzyjne   | `documentation/team/architecture/ai-decision-trees.md`            |
| Refactoring audit  | `documentation/team/architecture/refactoring-audit.md`            |
| Auth migration     | `documentation/team/architecture/auth-migration.md`               |
| DB architect agent | `.github/agents/DB architect.agent.md`                   |
| Skills             | `.agents/skills/*.md`                                    |
| Review process     | `factory/prompts/reviewer.md`                            |
| Commit process     | `factory/prompts/committer.md`                           |
| Koncepcja fabryki  | `factory/CONCEPT.md`                                     |

---

## 8. Dokumentacja projektowa (plan/progress/log) - tylko aktywne taski

`plan.md`, `progress.md`, `activity-log.md` sa artefaktami tymczasowymi i istnieja tylko dla OPEN/IN_PROGRESS.

| Modul                      | Plan | Postep | Activity log |
| -------------------------- | ---- | ------ | ------------ |
| Contract Meeting Notes     | `documentation/team/operations/contract-meeting-notes/plan.md` | `documentation/team/operations/contract-meeting-notes/progress.md` | `documentation/team/operations/contract-meeting-notes/activity-log.md` |
| Persons v2 refactor        | `documentation/team/operations/persons-v2-refactor/plan.md` | `documentation/team/operations/persons-v2-refactor/progress.md` | `documentation/team/operations/persons-v2-refactor/activity-log.md` |
| Public profile submission  | `documentation/team/operations/public-profile-submission/plan.md` | `documentation/team/operations/public-profile-submission/progress.md` | `documentation/team/operations/public-profile-submission/activity-log.md` |

Lifecycle zamknietego taska:

1. Przenies finalny stan do kanonicznych plikow `documentation/team/*` (podmiana starego stanu nowym).
2. Dodaj wpis do `documentation/team/operations/post-change-checklist.md` jesli zmiana dotyczy DB/env/deploy.
3. Usun `plan.md`, `progress.md`, `activity-log.md` dla zamknietego taska (historia zostaje w Git).

Uwaga:

- Agent dokumentacyjny mapuje `[Feature]` tylko do istniejacych katalogow `documentation/team/operations/*`.

### 8a. Resolver `[Feature]` dla Documentarian

Kolejnosc rozstrzygania:

1. `operations_docs_path` z kontraktu planu (jesli obecne).
2. Jawna sciezka z wejscia (`documentation/team/operations/<feature>/`).
3. Feature/checkpoint z metadanych taska.
4. Mapowanie z tabeli w sekcji 8.

Jesli nie da sie jednoznacznie wyznaczyc katalogu:

- status: `BLOCKED: missing feature mapping`,
- brak zapisu do docs do czasu doprecyzowania mapowania.

---

## 9. Factory (meta-narzedzia)

| Plik                                       | Opis                                                      |
| ------------------------------------------ | --------------------------------------------------------- |
| `factory/STATUS.md`                        | Aktualny status budowy fabryki                            |
| `factory/CONCEPT.md`                       | Kanoniczny opis koncepcji Dark Factory                    |
| `factory/CONCEPT-DIAGRAMS.md`              | Diagramy koncepcji (human-friendly)                       |
| `factory/TOOL-ADAPTERS.md`                 | Wspolny adapter workflow dla narzedzi                     |
| `factory/templates/task-plan-context.yaml` | Szablon planu taska (required/optional context + budget)  |
| `factory/adapters/codex.md`                | Adapter sesji dla Codex                                   |
| `factory/adapters/claude-code.md`          | Adapter sesji dla Claude Code                             |
| `factory/adapters/copilot-vscode.md`       | Adapter sesji dla Copilot VS Code                         |
| `factory/PROMPTS-SESSIONS.md`              | Prompty na kolejne sesje                                  |
| `factory/FACTORY-FLOW.md`                  | Opis przeplywu fabryki i lifecycle zamkniecia taskow      |
| `factory/prompts/reviewer.md`              | Prompt reviewera AI                                       |
| `factory/prompts/planner.md`               | S.O.T. dla fazy inicjalizacji taska (Planner)             |
| `factory/prompts/documentarian.md`         | Prompt Agenta Dokumentacyjnego (Auto-docs + Close&Purge)  |
| `factory/prompts/committer.md`             | Prompt Agenta Committer (`COMMIT_APPROVED`, commit only)  |

Uwaga: Pliki `factory/AUDIT-SERVER.md` i `factory/AUDIT-CLIENT.md` zostaly przeniesione odpowiednio do:
`documentation/team/architecture/conventions/coding-server.md`,
`documentation/team/architecture/conventions/coding-client.md`.
Plik `factory/SYSTEM-MAP.md` zostal usuniety po migracji; mapa API canonical jest w:
`documentation/team/architecture/system-map.md`.
Stuby `factory/AUDIT-*` i `factory/DOCS-MAP.md` zostaly usuniete po okresie przejsciowym.

---

## Polityka dokumentacji

Zrodlo: `documentation/team/README.md`

- Kanoniczne dokumenty zyja w `documentation/team/` (architecture/, onboarding/, runbooks/, operations/).
- Root-level `.md` powinny byc redirectami, nie duplikatami.
- Adaptery narzedziowe (`.github/instructions/`, `CLAUDE.md`) linkuja do canonical.
- Factory (`factory/`) zawiera TYLKO meta-narzedzia AI (prompty, adaptery sesji, koncepcje).
