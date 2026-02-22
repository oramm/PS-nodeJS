# Dark Factory — Flow (stan na 2026-02-22)

## Jak to działa teraz

```
CZŁOWIEK                    PLANNER                     CODER                    TESTER                   REVIEWER
(orchestrator)              (planner.md)                (nowa sesja)             (tester.md)              (reviewer.md)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ┌─────────────────┐
  │ Cel biznesowy    │
  │ + ograniczenia   │
  └────────┬────────┘
           │
           ▼
           ├──────────────► ┌──────────────────────┐
           │                │ Eksploracja kodu      │
           │                │ (Context Gate v1)     │
           │                │                      │
           │                │ Generuje YAML:       │
           │                │  • cele techniczne   │
           │                │  • kryteria testów   │
           │                │  • pliki kontekstu   │
           │                │  • budżet tokenów    │
           │                └──────────┬───────────┘
           │                           │
           │                           ▼
  ┌────────┴────────┐       ┌──────────────────────┐
  │  CHECKPOINT      │◄──────│ YAML kontrakt        │
  │                  │       │ (task-plan-context)   │
  │  PLAN_APPROVED?  │       └──────────────────────┘
  │  PLAN_REJECTED?  │
  └────────┬────────┘
           │
           │ APPROVED
           ▼
           ├─────────────────────────────► ┌──────────────────────┐
           │                               │ Pisze kod            │
           │                               │ (ma YAML + pliki)    │
           │                               └──────────┬───────────┘
           │                                          │
           │                                          │ git diff
           │                                          ▼
           │                                          ├──────────────────────► ┌──────────────────────┐
           │                                          │                       │ yarn test            │
           │                                          │                       │                      │
           │                                          │                       │ TEST_VERDICT:        │
           │                                          │                       │  TEST_PASS           │
           │                                          │                       │  TEST_FAIL           │
           │                                          │                       └──────────┬───────────┘
           │                                          │                                  │
           │                                          │               ┌──────────────────┤
           │                                          │               │                  │
           │                                          │          TEST_FAIL           TEST_PASS
           │                                          │               │            + TEST_REPORT
           │                                          │               ▼                  │
           │                                          │     ┌─────────────────┐          │
           │                                          │◄────│ Fix + retest    │          │
           │                                          │     │ (max 3x)       │          │
           │                                          │     └─────────────────┘          │
           │                                          │                                  ▼
           │                                          │                       ┌──────────────────────┐
           │                                          │                       │ Review zmian         │
           │                                          │                       │ + TEST_REPORT        │
           │                                          │                       │                      │
           │                                          │                       │ VERDICT:             │
           │                                          │                       │  APPROVE             │
           │                                          │                       │  REQUEST_CHANGES     │
           │                                          │                       └──────────┬───────────┘
           │                                          │                                  │
           │                                          │                    ┌─────────────┤
           │                                          │                    │             │
           │                                          │             REQUEST_CHANGES   APPROVE
           │                                          │                    │             │
           │                                          │                    ▼             │
           │                                          │          ┌─────────────────┐    │
           │                                          │◄─────────│ Fix + retest    │    │
           │                                          │          │ (max 3x)       │    │
           │                                          │          └─────────────────┘    │
           │                                          │                                 │
           │                                          │         3x fail = ESKALACJA     │
           │                                          │              │                  │
  ┌────────┴────────┐                                 │              │                  │
  │                  │◄──────────────────────────────────────────────┘                  │
  │  Commit + docs   │◄────────────────────────────────────────────────────────────────┘
  │  (ręcznie)       │
  └──────────────────┘
```


## Kto ma jakie skille

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│  CZŁOWIEK (orchestrator)                                                        │
│  ├── Definiuje cel i ograniczenia                                               │
│  ├── Zatwierdza plan (PLAN_APPROVED / PLAN_REJECTED)                            │
│  ├── Rozstrzyga eskalacje (3x fail, ryzyko bezpieczeństwa, niejasne wymagania) │
│  ├── Commituje i aktualizuje docs (Warstwa 4 jeszcze nie wdrożona)             │
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
│  Testy         → architektura-testowanie.md         │
│  API / typy    → SYSTEM-MAP.md + types.d.ts         │
│  DB / env      → docs/team/operations/*             │
└────────────────────────┬────────────────────────────┘
                         │
                   bloker / brak danych?
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  WARSTWA C — tylko z uzasadnieniem                   │
│                                                     │
│  AUDIT-SERVER.md / AUDIT-CLIENT.md                  │
│  architektura-szczegoly.md                          │
└─────────────────────────────────────────────────────┘
```


## Co jest, czego nie ma

```
  Reviewer Agent ·········· ✅ wdrożony     prompt + review loop + severity levels
  Test Pipeline ··········· ✅ wdrożony     prompt + TEST_VERDICT + przekazanie do reviewera
  Planner ················· ✅ wdrożony     prompt + YAML kontrakt + human checkpoint
  Auto-docs ··············· ❌ następny     aktualizacja docs w cyklu ze zmianą kodu
  Committer ··············· ❌ przyszłość   standaryzacja commitów / PR
  Orchestrator (agent) ···· ❌ przyszłość   agent zamiast człowieka jako koordynator
```
