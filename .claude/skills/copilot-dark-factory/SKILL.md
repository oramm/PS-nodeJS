---
name: copilot-dark-factory
description: Copilot-specific entrypoint for Dark Factory tasks. Use when a task needs Factory workflow, plan/test/review/commit gates, or multi-step orchestration. Adds conditional /fleet guidance and loads the right Factory docs.
allowed-tools: Read, Glob, Grep
---

# Copilot Dark Factory

To jest cienki, Copilot-specific skill dla zadan, w ktorych Copilot ma pracowac wg Dark Factory.

Skill istnieje po to, aby:

- nie zmieniac wspolnych plikow `factory/*` regualami specyficznymi dla Copilota,
- doladowac Copilotowi tylko te dokumenty i prompty Factory, ktore sa potrzebne do biezacego taska,
- dodac Copilot-only guidance, w tym warunkowe uzycie `/fleet`.

## Ważne

- Ten skill **nie aktywuje sie od slowa kluczowego**.
- To **jawny entrypoint**: trzeba go uruchomic swiadomie dla taska, ktory wymaga procesu Dark Factory.

## Kiedy uzyc

Uzyj tego skilla, gdy task:

- wymaga planu i acceptance criteria,
- obejmuje implementacje + testy + review loop + commit gate,
- jest wieloetapowy lub obejmuje kilka modulow,
- dotyka API, DB, architektury lub publicznego kontraktu,
- obejmuje cross-repo scope (`PS-nodeJS` + `ENVI.ProjectSite`),
- wymaga delegacji do subagentow lub shardowania pracy.

Nie uzywaj go domyslnie dla malych, lokalnych zmian typu:

- 1-2 pliki,
- brak zmian DB/env/deploy,
- brak zmian API/public interface,
- brak potrzeby review/test orchestration poza standardowym lokalnym flow.

## Obowiazkowe pliki — przeczytaj na starcie

1. `C:\Apache24\htdocs\PS-nodeJS\.github\copilot-instructions.md`
2. `C:\Apache24\htdocs\PS-nodeJS\factory\TOOL-ADAPTERS.md`
3. `C:\Apache24\htdocs\PS-nodeJS\factory\adapters\copilot-vscode.md`
4. `C:\Apache24\htdocs\PS-nodeJS\factory\PROMPTS-SESSIONS.md`
5. `C:\Apache24\htdocs\PS-nodeJS\documentation\team\operations\docs-map.md`

## Doladuj wg etapu taska

- planowanie -> `factory/prompts/planner.md`
- orkiestracja / integrator -> `factory/prompts/orchestrator-assistant.md`
- implementacja -> `factory/prompts/coder.md`
- testy -> `factory/prompts/tester.md`
- review -> `factory/prompts/reviewer.md`
- commit -> `factory/prompts/committer.md`

## Copilot-only reguła dla `/fleet`

### Uzyj `/fleet`, gdy:

- task ma pelny pipeline Dark Factory:
    - plan,
    - implementacja,
    - testy,
    - review,
    - `COMMIT_REQUEST` / `COMMIT_APPROVED`,
- potrzeba subagentow lub rozdzielenia pracy,
- task jest cross-repo,
- task jest na tyle zlozony, ze orkiestracja reczna bedzie gorsza niz praca flotowa.

### Nie zaczynaj od `/fleet`, gdy:

- zmiana jest mala i lokalna,
- wystarczy zwykly chat lub pojedyncza sesja Edits,
- nie ma potrzeby shardowania ani wieloetapowej koordynacji.

## Co zrobic po zaladowaniu

1. Krotko potwierdz, jakie dokumenty Factory zostaly zaladowane.
2. Powiedz, czy dla biezacego taska `/fleet` jest rekomendowany, czy nie.
3. Jesli task kwalifikuje sie do Dark Factory, dalej prowadz go wedlug procesu Factory.
