# Prompty na kolejne sesje fabryki

## Quick Start - one-linery (copy/paste)

### Codex

```text
Pracuj wg AGENTS.md i Low-Context First. Start tylko z Warstwa A: factory/CONCEPT.md, factory/TOOL-ADAPTERS.md, factory/prompts/tester.md, factory/prompts/reviewer.md. Warstwe B/C doladuj tylko gdy task tego wymaga. Workflow: Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit. Uzupelnij required_context_files, optional_context_files, context_budget_tokens. Nie koncz taska bez APPROVE.
```

### Claude Code

```text
Pracuj wg CLAUDE.md i Low-Context First. Start tylko z Warstwa A: factory/CONCEPT.md, factory/TOOL-ADAPTERS.md, factory/prompts/tester.md, factory/prompts/reviewer.md. Warstwe B/C doladuj tylko gdy task tego wymaga. Workflow: Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit. Uzupelnij required_context_files, optional_context_files, context_budget_tokens. Po 3 nieudanych iteracjach eskaluj do czlowieka.
```

### Copilot VS Code

```text
Pracuj wg .github/copilot-instructions.md i Low-Context First. Start tylko z Warstwa A: factory/CONCEPT.md, factory/TOOL-ADAPTERS.md, factory/prompts/tester.md, factory/prompts/reviewer.md. Warstwe B/C doladuj tylko gdy task tego wymaga. Workflow: Plan -> Implementacja -> Test -> Review loop -> Docs -> Commit. Uzupelnij required_context_files, optional_context_files, context_budget_tokens. Nie zamykaj taska bez APPROVE.
```

---

## Sesja 0b: Audyt Klienta DONE

```text
[wykonano - wyniki w factory/AUDIT-CLIENT.md i factory/SYSTEM-MAP.md]
```

## Sesja 1: Reviewer Agent DONE

Podsumowanie:
- Stworzono `factory/prompts/reviewer.md` - prompt reviewera (konkretny dla ENVI stack)
- Stworzono `factory/DOCS-MAP.md` - mapa zrodel prawdy (S.O.T.)
- Dodano sekcje "Factory: Review Process" do `CLAUDE.md`
- Test na zywo: healthCheck() na ToolsDb.ts -> APPROVE z 2 uwagami (MEDIUM: kruche internal API, LOW: cichy catch)
- Reviewer poprawnie rozumie kontekst projektu, nie generuje false positives

## Sesja 2: Test Pipeline DONE

Podsumowanie:
- Stworzono `factory/prompts/tester.md` — prompt agenta testujacego (TEST_VERDICT: TEST_PASS | TEST_FAIL)
- Rozszerzono `factory/prompts/reviewer.md` o sekcje E) TEST CONTEXT (wstecznie kompatybilna)
- Odwrocono pipeline we wszystkich dokumentach: `Test -> Review` (zamiast `Review -> Test`)
- Zaktualizowano diagramy w `factory/CONCEPT-DIAGRAMS.md`
- Zaktualizowano adaptery: `factory/TOOL-ADAPTERS.md`, `factory/adapters/claude-code.md`, `factory/adapters/codex.md`, `factory/adapters/copilot-vscode.md`
- Dodano `factory/prompts/tester.md` do Context Gate Warstwa A we wszystkich dokumentach
- Zaktualizowano one-linery w Quick Start

## Pilot Low-Context First (2-3 sesje)

Checklist pilota:
- [ ] Kazdy task startuje od Warstwy A.
- [ ] Warstwa B doladowana tylko gdy task tego wymaga.
- [ ] Warstwa C doladowana tylko po triggerze "missing detail".
- [ ] Uzupelnione pola: required_context_files, optional_context_files, context_budget_tokens.

Metryki do zebrania:
- liczba iteracji review na task,
- liczba eskalacji na sesje,
- czas taska,
- liczba doladowanych dokumentow.

Decyzja po pilocie:
- jesli metryki sa stabilne, rozwaz automatyzacje hookami;
- jesli nie, kalibruj trigger dla Warstwy C i budzet kontekstu.

## Sesja 3: Planner

[placeholder]

## Sesja 4: Auto-docs

[placeholder]
