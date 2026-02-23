# Adapter - Copilot VS Code

## Uzycie

Copilot nie prowadzi sam pelnej orkiestracji, wiec prowadz sesje jawnie:

1. Wklej prompt startowy w Copilot Chat.
2. Wybierz tylko potrzebne warstwy dokumentacji:
    - backend: `Canonical -> Adaptery -> Factory`
    - klient: `Canonical -> Adaptery`
3. Dziel prace na male taski.
4. Po implementacji uruchom testy wg `factory/prompts/tester.md`.
5. Wynik `TEST_REPORT` przekaz do review wg `factory/prompts/reviewer.md`.
6. Przy planie taska uzupelnij:
    - `required_context_files`
    - `optional_context_files`
    - `context_budget_tokens`
    - `documentation_layers`
    - `documentation_selection_justification`
    - `operations_feature_slug`
    - `operations_docs_path`
7. Gdy scope obejmuje frontend, jawnie pracuj na obu repo:
    - `C:\Apache24\htdocs\PS-nodeJS`
    - `C:\Apache24\htdocs\ENVI.ProjectSite`
8. Jesli wyszukiwarka jest ograniczona do workspace, czytaj pliki klienta po sciezkach bezwzglednych.
9. Jesli dostep do repo klienta jest zablokowany, zglos blocker i popros o diff/pliki; nie oznaczaj review jako pelnego.

## Prompt startowy (copy/paste)

```text
Pracuj wg .github/copilot-instructions.md oraz factory/TOOL-ADAPTERS.md (Low-Context First).
Wybierz tylko potrzebne warstwy dokumentacji:
- backend: Canonical -> Adaptery -> Factory
- klient: Canonical -> Adaptery
Workflow:
Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Po implementacji uruchom testy wg factory/prompts/tester.md.
Wynik TEST_REPORT przekaz do review wg factory/prompts/reviewer.md.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens,
documentation_layers, documentation_selection_justification,
operations_feature_slug i operations_docs_path.
Nie koncz taska bez review APPROVE.
Jesli scope obejmuje frontend, sprawdz takze C:\Apache24\htdocs\ENVI.ProjectSite.
Jesli brak dostepu do ENVI.ProjectSite, zglos to jawnie jako blocker.
```

## Planner (Warstwa 3)

### Plan agent (Copilot Edits - tryb agenta)

Uzyj **Copilot Edits w trybie agenta** do fazy planowania.
`@workspace` indeksuje repozytorium - nie wskazuj plikow recznie, chyba ze sa to krytyczne S.O.T.

**Pinowanie S.O.T. przez `#file` (tylko dla plikow krytycznych):**

- `#file:factory/prompts/planner.md` - zasady Plannera
- `#file:factory/CONCEPT.md` - fundament Dark Factory
- `#file:.github/instructions/architektura.instructions.md` - gdy task dotyka architektury

> Uwaga: `@workspace` indeksuje repo, ale nie zawsze jest pelnym snapshotem. Dla plikow krytycznych (kontrakt API, typy) uzyj `#file` jako gwarancji swiezosci danych.

### Workflow planowania

1. Otworz Copilot Edits (agent mode).
2. Opisz task i dodaj: "Przygotuj plan wg `#file:factory/prompts/planner.md`."
3. Copilot z `@workspace` analizuje i proponuje YAML kontrakt.
4. Ty zatwierdzasz lub odrzucasz plan.
5. Po `PLAN_APPROVED`: **nowa sesja Edits** z YAML kontraktem jako kontekstem startowym.

### Cross-repo scope

Gdy task obejmuje frontend: jawnie dodaj `#file` z `C:\Apache24\htdocs\ENVI.ProjectSite`
dla kluczowych plikow (typow, komponentow). `@workspace` moze nie indeksowac drugiego repo.

### PLAN_DEVIATION_REPORT

Coder zglasza przez wiadomosc: "PLAN_DEVIATION_REPORT: [opis]".
Wroc do sesji Plan agent z DEVIATION jako kontekstem - popraw kontrakt.
Max 2 rundy. Czlowiek jest ostatecznym arbitrem zmiany scope.

## Wzorzec rozmowy na task

1. "Przygotuj plan taska i acceptance criteria."
2. "Zaimplementuj task zgodnie z planem."
3. "Uruchom testy wg factory/prompts/tester.md."
4. "Wykonaj review wg factory/prompts/reviewer.md (przekaz TEST_REPORT) i wypisz issues."
5. "Napraw issues, potem podaj finalny diff."
6. "Zaktualizuj dokumentacje wg factory/prompts/documentarian.md."
