# Dark Factory Concept (PS-nodeJS)

> Kanoniczny opis koncepcji Dark Factory dla tego repo.
> Status dokumentu: aktywny
> Data aktualizacji: 2026-02-20

## 1. Cel i definicja

Dark Factory w tym projekcie to proces, w ktorym czlowiek definiuje cel i kryteria akceptacji, a agenty AI realizuja kolejne etapy produkcji kodu w kontrolowanym pipeline:

`Plan -> Implementacja -> Review -> Test -> Docs -> Commit`.

Model pracy:
- Human-in-the-loop na checkpointach decyzyjnych.
- Human-on-the-loop podczas rutynowej produkcji.
- Eskalacja do czlowieka po przekroczeniu limitow iteracji lub przy decyzjach architektonicznych.

## 2. Zakres i non-goals

### W zakresie (aktualna iteracja)
- Warstwa 1: Reviewer agent (wdrozona).
- Spisanie pelnej koncepcji i workflow dla kolejnych warstw.
- Ustalenie checkpointow, metryk i kryteriow przejsc miedzy warstwami.
- Powiazanie koncepcji z aktualnymi artefaktami w `factory/`.

### Poza zakresem (na teraz)
- Pelna orkiestracja wieloagentowa end-to-end.
- Automatyczny commit/push/PR jako twardy standard dla wszystkich zmian.
- Refaktoryzacja calego zestawu dokumentow `factory/*`.

## 3. Architektura agentowa (stan docelowy, wdrazana warstwowo)

Role agentow:
- `Orchestrator`: prowadzi pipeline, pilnuje kolejnosci i checkpointow.
- `Planner`: rozbija cel na taski, zaleznosci i acceptance criteria.
- `Coder`: implementuje task na podstawie kontekstu.
- `Reviewer`: niezalezny audit kodu i ryzyk.
- `Fixer`: poprawki po review i po testach.
- `Tester`: uruchamia i uzupelnia testy.
- `Docs`: utrzymuje dokumentacje i spojnosc docs <-> kod.
- `Committer` (opcjonalnie): standaryzuje komunikaty i material PR.

Kluczowa zasada: `Reviewer != Coder` (inna perspektywa, mniejszy bias).

## 4. RACI per etap

| Etap | Czlowiek | Orchestrator | Subagenty |
|---|---|---|---|
| Planowanie | **A** (approve/zmiany) | **R** | Planner (**C**) |
| Architektura | **A** | **R** | Planner/Architect (**C**) |
| Implementacja taska | **I** | **A** | Coder (**R**) |
| Review | **I** | **A** | Reviewer (**R**) |
| Fix loop | **C** przy problemach | **A** | Fixer (**R**) |
| Testowanie | **I** / **C** przy failach | **A** | Tester (**R**) |
| Dokumentacja | **I** | **A** | Docs (**R**) |
| Commit/PR | **A** dla merge gate | **R** | Committer (**C**) |
| Eskalacja | **A/R** | **R** (trigger) | dowolny agent (**C**) |

Legenda: `R` = Responsible, `A` = Accountable, `C` = Consulted, `I` = Informed.

## 5. Pipeline operacyjny

1. Plan:
- wejscie: cel biznesowy + ograniczenia,
- wyjscie: taski, zaleznosci, kryteria akceptacji,
- checkpoint: approval czlowieka.

2. Implementacja:
- coder realizuje pojedynczy task z kontekstem tylko potrzebnych plikow.

3. Review loop:
- reviewer ocenia zmiany,
- verdict: `APPROVE` albo `REQUEST_CHANGES`,
- fixer poprawia i wraca do review (max 3 iteracje),
- po 3 nieudanych iteracjach: eskalacja.

4. Test:
- lint, typecheck, unit/integration, security checks (wg warstwy 2),
- fail -> fixer -> retest,
- kolejne niepowodzenia -> eskalacja.

5. Docs:
- aktualizacja README/API/architektury/changelog (zakres zalezy od zmiany),
- sprawdzenie spojnosci docs z kodem.

6. Commit:
- standard komunikatow i powiazanie z taskiem.

### Context Gate v1 (Low-Context First)

Na starcie kazdego taska agent laduje tylko Warstwe A. Warstwy B/C sa dolaczane selektywnie.

Warstwa A (always-on, zawsze):
- `factory/CONCEPT.md`
- `factory/TOOL-ADAPTERS.md`
- `factory/prompts/reviewer.md`

Warstwa B (task-scoped, zalezne od typu taska):
- Architektura backend: `.github/instructions/architektura.instructions.md`
- Testy: `.github/instructions/architektura-testowanie.md`
- API/kontrakty: `factory/SYSTEM-MAP.md` + `src/types/types.d.ts`
- Env/deploy/db: `docs/team/onboarding/*` + `docs/team/operations/*`

Warstwa C (fallback/deep dive, tylko z uzasadnieniem):
- `factory/AUDIT-SERVER.md`
- `factory/AUDIT-CLIENT.md`
- `.github/instructions/architektura-szczegoly.md`
- `.github/instructions/architektura-ai-assistant.md`

Regula:
- Zakaz ladowania Warstwy C "na dzien dobry".
- Wejscie do Warstwy C wymaga triggera: brak danych do decyzji, konflikt kontraktu, review blocker.

## 6. Checkpointy i eskalacja

Obowiazkowe checkpointy:
- po planie,
- po architekturze,
- finalny przed merge/release.

Eskalacja obowiazkowa, gdy:
- decyzja zmienia architekture lub interfejs publiczny,
- review/test failuja po 3 iteracjach,
- pojawia sie ryzyko bezpieczenstwa lub niejednoznaczne wymaganie.

## 7. Metryki jakosci i kryteria przejsc miedzy warstwami

Minimalne metryki:
- Review quality: liczba istotnych issue wykrytych przed merge.
- Pass rate test pipeline: odsetek taskow przechodzacych pelny pipeline.
- Rework loop: srednia liczba iteracji review/fix.
- Defect leakage: bledy wykryte po mergu.
- Doc freshness: czy docs aktualizowane w tym samym cyklu co kod.
- Context load: liczba doladowanych plikow i laczny budzet tokenow na task.

Kryteria przejsc:
- Warstwa 1 -> 2: review loop stabilny, powtarzalny format wynikow.
- Warstwa 2 -> 3: test pipeline uruchamialny i wymuszony dla taska.
- Warstwa 3 -> 4: planowanie i auto-docs dzialaja bez dryfu dokumentacji.

### Budzet kontekstu

Soft limit na pojedynczy task:
- `context_budget_tokens`: 12000-20000
- lista kontekstu: max 5-8 plikow

Po przekroczeniu limitu:
- podziel task na mniejsze podtaski, albo
- odrocz analize deep-dive do osobnej iteracji.

## 8. Roadmapa iteracyjna (zgodna z `factory/STATUS.md`)

- Warstwa 1 (DONE): Reviewer Agent.
- Warstwa 2 (NEXT): Test Pipeline.
- Warstwa 3: Planner (top-down decomposition + dependency graph).
- Warstwa 4: Auto-docs i consistency checks.

Strategia: wdrozenie warstwowe "na cebulke", bez przeskakiwania fundamentow.

Priorytet delivery:
- balans 50/50: funkcjonalnosci + refactor techniczny.
- refactor nie blokuje delivery, chyba ze dotyczy bezpieczenstwa, stabilnosci lub kontraktu API.

## 9. Mapowanie do istniejacych plikow Factory

- Status i postep: `factory/STATUS.md`
- Sesje i prompty operacyjne: `factory/PROMPTS-SESSIONS.md`
- Prompt reviewera (warstwa 1): `factory/prompts/reviewer.md`
- Mapa zrodel prawdy: `factory/DOCS-MAP.md`
- Diagramy koncepcji: `factory/CONCEPT-DIAGRAMS.md`

## 10. Lekki audyt spojnosci (2026-02-20)

Wynik: **spojne z obecnym etapem**, bez konfliktu z reviewerem.

Potwierdzenia:
- Nazewnictwo etapow zgadza sie ze statusem warstwowym.
- Koncepcja respektuje juz wdrozone elementy (szczegolnie reviewer).
- `DOCS-MAP` pozostaje mapa S.O.T., nie zostaje zastapiona przez koncept.

Drobne rekomendacje:
- utrzymac jeden styl nazewnictwa warstw i etapow we wszystkich plikach,
- trzymac cross-linki miedzy `CONCEPT`, `STATUS`, `PROMPTS-SESSIONS`, `DOCS-MAP`,
- przy kolejnej iteracji dopisac mierzalne progi (np. coverage, SLA review).

## 11. Interfejs planowania taska (wymagany)

Kazdy plan taska musi zawierac:

```yaml
required_context_files: []
optional_context_files: []
context_budget_tokens: 0
```

Zasady:
- `required_context_files`: tylko pliki konieczne do wykonania taska (max 5-8).
- `optional_context_files`: pliki do doczytania warunkowo.
- `context_budget_tokens`: estymacja budzetu kontekstu (soft limit 12k-20k).

## 12. Pilot i decyzja o automatyzacji

Najpierw 2-3 sesje pilota z recznym Context Gate v1.

Zbierane metryki:
- liczba iteracji review na task,
- liczba eskalacji na sesje,
- czas taska,
- liczba doladowanych dokumentow.

Hooki/skrypty (np. Claude hooks):
- etap opcjonalny,
- rozpatrywany dopiero po stabilnym pilocie recznym.
