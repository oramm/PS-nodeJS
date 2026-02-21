# Adapter - Copilot VS Code

## Uzycie
Copilot nie prowadzi sam pelnej orkiestracji, wiec prowadz sesje jawnie:
1. Wklej prompt startowy w Copilot Chat.
2. Startuj tylko z Warstwa A, warstwy B/C doladuj warunkowo.
3. Dziel prace na male taski.
4. Po implementacji uruchom testy wg `factory/prompts/tester.md`.
5. Wynik TEST_REPORT przekaz do review wg `factory/prompts/reviewer.md`.
6. Przy planie taska uzupelnij:
   - `required_context_files`
   - `optional_context_files`
   - `context_budget_tokens`
7. Gdy scope obejmuje frontend, jawnie pracuj na obu repo:
   - `C:\Apache24\htdocs\PS-nodeJS`
   - `C:\Apache24\htdocs\ENVI.ProjectSite`
8. Jesli wyszukiwarka jest ograniczona do workspace, czytaj pliki klienta po sciezkach bezwzglednych.
9. Jesli dostep do repo klienta jest zablokowany, zglos blocker i popros o diff/pliki; nie oznaczaj review jako pelnego.

## Prompt startowy (copy/paste)

```text
Pracuj wg .github/copilot-instructions.md oraz factory/TOOL-ADAPTERS.md (Low-Context First).
Start tylko z Warstwa A.
Workflow:
Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit.
Po implementacji uruchom testy wg factory/prompts/tester.md.
Wynik TEST_REPORT przekaz do review wg factory/prompts/reviewer.md.
Warstwe B/C doladuj tylko gdy task tego wymaga.
Uzupelnij required_context_files, optional_context_files, context_budget_tokens.
Nie koncz taska bez review APPROVE.
Jesli scope obejmuje frontend, sprawdz takze C:\Apache24\htdocs\ENVI.ProjectSite.
Jesli brak dostepu do ENVI.ProjectSite, zglos to jawnie jako blocker.
```

## Wzorzec rozmowy na task
1. "Przygotuj plan taska i acceptance criteria."
2. "Zaimplementuj task zgodnie z planem."
3. "Uruchom testy wg factory/prompts/tester.md."
4. "Wykonaj review wg factory/prompts/reviewer.md (przekaz TEST_REPORT) i wypisz issues."
5. "Napraw issues, potem podaj finalny diff."
