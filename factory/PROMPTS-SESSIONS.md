# Prompty na kolejne sesje fabryki

## Sesja 0b: Audyt Klienta ✅ DONE

```
[wykonano — wyniki w factory/AUDIT-CLIENT.md i factory/SYSTEM-MAP.md]
```

## Sesja 1: Reviewer Agent ✅ DONE

**Podsumowanie:**
- Stworzono `factory/prompts/reviewer.md` — prompt reviewera (152 LOC, konkretny dla ENVI stack)
- Stworzono `factory/DOCS-MAP.md` — mapa źródeł prawdy (9 kategorii)
- Dodano sekcję "Factory: Review Process" do `CLAUDE.md`
- Test na żywo: healthCheck() na ToolsDb.ts → APPROVE z 2 uwagami (MEDIUM: kruche internal API, LOW: cichy catch)
- Reviewer poprawnie rozumie kontekst projektu, nie generuje false positives

## Sesja 2: Test Pipeline

````
Kontynuuję wdrażanie "Dark Code Factory".
Metoda: warstwowa ("na cebulkę") — jedna warstwa na raz.

KONTEKST:
- Serwer zaudytowany → factory/AUDIT-SERVER.md
- Klient zaudytowany → factory/AUDIT-CLIENT.md
- Mapa systemu → factory/SYSTEM-MAP.md
- Mapa dokumentacji → factory/DOCS-MAP.md
- Status → factory/STATUS.md
- Reviewer → factory/prompts/reviewer.md

Przeczytaj factory/STATUS.md i factory/DOCS-MAP.md
żeby znać aktualny stan.

═══════════════════════════════════════════════════════
WARSTWA 2: TEST PIPELINE
═══════════════════════════════════════════════════════

Cel: Każda zmiana w kodzie jest automatycznie testowana
PRZED review. Subagent reviewer dostaje wynik testów
jako dodatkowy kontekst.

[do uzupełnienia po zatwierdzeniu kierunku warstwy 2]
````

## Sesja 3: Planner

[placeholder]

## Sesja 4: Auto-docs

[placeholder]
