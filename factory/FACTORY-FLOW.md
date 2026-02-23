# Dark Factory — Flow (stan na 2026-02-22)

## Jak to działa teraz

```
┌───────────────┬───────────────┬───────────────┬───────────────┬───────────────┬───────────────┐
│   CZŁOWIEK    │   PLANNER     │   CODER       │   TESTER      │   REVIEWER    │ DOCUMENTARIAN │
├───────────────┼───────────────┼───────────────┼───────────────┼───────────────┼───────────────┤
│               │               │               │               │               │               │
│ [1] Cel biz.  │               │               │               │               │               │
│ + ograniczenia│               │               │               │               │               │
│   ═══════════>│               │               │               │               │               │
│               │ [2] YAML      │               │               │               │               │
│               │ kontrakt +    │               │               │               │               │
│               │ CHECKPOINT    │               │               │               │               │
│   <═══════════│               │               │               │               │               │
│  PLAN_REJECTED│ → korekta     │               │               │               │               │
│  → ponowny    │   planu       │               │               │               │               │
│    CHECKPOINT │               │               │               │               │               │
│               │               │               │               │               │               │
├───────────────┼───────────────┼───────────────┼───────────────┼───────────────┼───────────────┤
│               │               │               │               │               │               │
│ [3] APPROVED  │               │               │               │               │               │
│   ═══════════════════════════>│               │               │               │               │
│               │               │ [4] Implement.│               │               │               │
│               │               │ + git diff    │               │               │               │
│               │               │   ═══════════>│               │               │               │
│               │               │               │               │               │               │
├───────────────┼───────────────┼───────────────┼───────────────┼───────────────┼───────────────┤
│               │               │               │               │               │               │
│               │               │               │ [5] TEST_FAIL │               │               │
│               │               │   <═══════════│ → fix + retest│               │               │
│               │               │  (naprawia)   │   (max 3x)   │               │               │
│               │               │   ═══════════>│               │               │               │
│               │               │               │ [5] TEST_PASS │               │               │
│               │               │               │ + TEST_REPORT │               │               │
│               │               │               │   ═══════════>│               │               │
│               │               │               │               │               │               │
├───────────────┼───────────────┼───────────────┼───────────────┼───────────────┼───────────────┤
│               │               │               │               │               │               │
│               │               │               │               │ [6] REQUEST_  │               │
│               │               │               │               │ CHANGES       │               │
│               │               │   <═══════════════════════════│ → fix + retest│               │
│               │               │  (naprawia → retest → re-review, max 3x)     │               │
│               │               │   ═══════════>│  ═══════════>│               │               │
│               │               │               │               │ [6] APPROVE   │               │
│               │               │               │               │   ═══════════>│               │
│               │               │               │               │               │               │
├───────────────┼───────────────┼───────────────┼───────────────┼───────────────┼───────────────┤
│               │               │               │               │               │               │
│               │               │               │               │               │ [7] Auto-docs │
│               │               │               │               │               │ (Warstwa      │
│               │               │               │               │               │  B/D/V)       │
│   <═══════════════════════════════════════════════════════════════════════════│ [7] DONE      │
│ [8] Commit    │               │               │               │               │               │
│ (ręcznie)     │               │               │               │               │               │
│               │               │               │               │               │               │
├───────────────┴───────────────┴───────────────┴───────────────┴───────────────┴───────────────┤
│                                                                                               │
│  Reguła eskalacji: 3× FAIL w pętli test/review → eskalacja do CZŁOWIEKA                      │
│                                                                                               │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Kto ma jakie skille

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  CZŁOWIEK (orchestrator)                                                        │
│  ├── Definiuje cel i ograniczenia                                               │
│  ├── Zatwierdza plan (PLAN_APPROVED / PLAN_REJECTED)                            │
│  ├── Rozstrzyga eskalacje (3x fail, ryzyko bezpieczeństwa, niejasne wymagania) │
│  ├── Commituje po zakończeniu Auto-docs                                         │
│  └── Wybiera narzędzie: Claude Code / Codex / Copilot VS Code                  │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  PLANNER  (factory/prompts/planner.md)                                          │
│  ├── Zbiera wymagania (pyta człowieka gdy niejasne)                             │
│  ├── Eksploruje kod (Context Gate: Warstwa A → B → C)                           │
│  ├── Analizuje architekturę (które warstwy Clean Arch dotknięte)                │
│  ├── Generuje YAML kontrakt (cele, kryteria, budżet kontekstu)                  │
│  ├── NIE implementuje, NIE testuje, NIE robi review                             │
│  └── Obsługuje PLAN_DEVIATION_REPORT (max 2 rundy poprawek)                     │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  CODER  (nowa sesja z kontekstem YAML)                                          │
│  ├── Implementuje kod wg YAML kontraktu                                         │
│  ├── Decyduje JAK (Planner mówi CO, Coder wybiera sposób)                       │
│  ├── Może odrzucić plan → PLAN_DEVIATION_REPORT                                 │
│  ├── Przekazuje zmiany (git diff) do Testera                                    │
│  └── Naprawia błędy po testach i review (rola Fixera)                           │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  TESTER  (factory/prompts/tester.md)                                            │
│  ├── Uruchamia yarn test (lub yarn test:{moduł})                                │
│  ├── Generuje TEST_REPORT                                                       │
│  ├── Wystawia TEST_VERDICT: TEST_PASS | TEST_FAIL                               │
│  └── Przy FAIL → Coder naprawia → retest (max 3 iteracje)                       │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  REVIEWER  (factory/prompts/reviewer.md)                                        │
│  ├── Dostaje: zmienione pliki + TEST_REPORT                                     │
│  ├── Ocenia: architektura, bezpieczeństwo, styl, ryzyka                         │
│  ├── Klasyfikuje: CRITICAL / HIGH / MEDIUM / LOW                                │
│  ├── VERDICT: APPROVE lub REQUEST_CHANGES                                       │
│  ├── ≠ Coder (świeże spojrzenie, izolowany kontekst)                            │
│  └── Przy REQUEST_CHANGES → Coder naprawia → retest → re-review (max 3x)       │
│                                                                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  DOCUMENTARIAN  (factory/prompts/documentarian.md)                              │
│  ├── Uruchamia się po VERDICT: APPROVE                                          │
│  ├── Aktualizuje Warstwę B (progress.md, activity-log.md)                       │
│  ├── Weryfikuje Warstwę D (alerty cross-repo przy zmianach API)                 │
│  └── Aktualizuje Warstwę V (diagramy Mermaid.js)                                │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Context Gate — co się ładuje

```
Start sesji
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  WARSTWA A — zawsze                                 │
│                                                     │
│  factory/CONCEPT.md                                 │
│  factory/TOOL-ADAPTERS.md                           │
│  factory/prompts/tester.md                          │
│  factory/prompts/reviewer.md                        │
│  factory/prompts/planner.md                         │
└────────────────────────┬────────────────────────────┘
                         │
                   task wymaga?
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  WARSTWA B — selektywnie                            │
│                                                     │
│  Backend arch  → architektura.instructions.md       │
│  Testy         → documentation/team/architecture/testing-per-layer.md │
│  API / typy    → documentation/team/architecture/system-map.md + src/types/types.d.ts │
│  DB / env      → documentation/team/operations/*                               │
└────────────────────────┬────────────────────────────┘
                         │
                   bloker / brak danych?
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  WARSTWA C — tylko z uzasadnieniem                   │
│                                                     │
│  documentation/team/architecture/refactoring-audit.md                         │
│  documentation/team/architecture/clean-architecture-details.md                │
└─────────────────────────────────────────────────────┘
```

## Co jest, czego nie ma

```
  Reviewer Agent ·········· ✅ wdrożony     prompt + review loop + severity levels
  Test Pipeline ··········· ✅ wdrożony     prompt + TEST_VERDICT + przekazanie do reviewera
  Planner ················· ✅ wdrożony     prompt + YAML kontrakt + human checkpoint
  Auto-docs ··············· ✅ wdrożony     prompt documentarian.md + 5 warstw dokumentacji
  Committer ··············· ❌ przyszłość   standaryzacja commitów / PR
  Orchestrator (agent) ···· ❌ przyszłość   agent zamiast człowieka jako koordynator
```
