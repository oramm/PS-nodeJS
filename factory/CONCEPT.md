# Dark Factory Concept (PS-nodeJS)

> Kanoniczny opis koncepcji Dark Factory dla tego repo.
> Status dokumentu: aktywny
> Data aktualizacji: 2026-02-25

## 1. Cel i definicja

Dark Factory w tym projekcie to proces, w ktorym czlowiek definiuje cel i kryteria akceptacji, a agenty AI realizuja kolejne etapy produkcji kodu w kontrolowanym pipeline:

`Plan -> Implementacja -> Test -> Review -> Docs -> Commit`.

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
- Warstwa 5: Committer v1 (`COMMIT_APPROVED`, commit only, bez push/PR).

### Poza zakresem (na teraz)
- Pelna orkiestracja wieloagentowa end-to-end.
- Automatyczny push/PR jako twardy standard dla wszystkich zmian.
- Refaktoryzacja calego zestawu dokumentow `factory/*`.

## 3. Architektura agentowa (stan docelowy, wdrazana warstwowo)

Role agentow:
- `Czlowiek-Orchestrator`: prowadzi decyzje gate'ow i approval.
- `Asystent Orkiestratora`: prowadzi pipeline operacyjny, deleguje subagentow, pilnuje kolejnosci i checkpointow.
- `Planner`: rozbija cel na taski, zaleznosci i acceptance criteria.
- `Coder`: implementuje task na podstawie kontekstu.
- `Reviewer`: niezalezny audit kodu i ryzyk.
- `Fixer`: poprawki po review i po testach.
- `Tester`: uruchamia i uzupelnia testy.
- `Docs`: utrzymuje dokumentacje i spojnosc docs <-> kod.
- `Committer` (wdrozony v1): wykonuje bezpieczny commit po `COMMIT_APPROVED`.

Prompt entry points (V1.1):
- Asystent Orkiestratora: `factory/prompts/orchestrator-assistant.md`
- Coder: `factory/prompts/coder.md`
- Planner: `factory/prompts/planner.md`
- Tester: `factory/prompts/tester.md`
- Reviewer: `factory/prompts/reviewer.md`
- Docs: `factory/prompts/documentarian.md`
- Committer: `factory/prompts/committer.md`

Kluczowa zasada: `Reviewer != Coder` (inna perspektywa, mniejszy bias).
Kluczowa zasada v1.1: `Asystent Orkiestratora MUST NOT implement code directly`.

## 4. RACI per etap

| Etap | Czlowiek | Asystent Orkiestratora | Subagenty |
|---|---|---|---|
| Planowanie | **A** (approve/zmiany) | **R** | Planner (**C**) |
| Architektura | **A** | **R** | Planner/Architect (**C**) |
| Implementacja taska | **I** | **A** (delegacja) | Coder[1..N] (**R**) |
| Integrator gate | **I** | **R/A** | Coder/Tester/Reviewer (**C**) |
| Review | **I** | **A** | Reviewer (**R**) |
| Fix loop | **C** przy problemach | **A** | Fixer (**R**) |
| Testowanie | **I** / **C** przy failach | **A** | Tester (**R**) |
| Dokumentacja | **I** | **A** | Docs (**R**) |
| Commit/PR | **A** dla merge gate | **R** | Committer (**C**) |
| Eskalacja | **A/R** | **R** (trigger + report) | dowolny agent (**C**) |

Legenda: `R` = Responsible, `A` = Accountable, `C` = Consulted, `I` = Informed.

## 5. Pipeline operacyjny

1. Plan:
- wejscie: cel biznesowy + ograniczenia,
- wyjscie: taski, zaleznosci, kryteria akceptacji,
- checkpoint: approval czlowieka.

2. Implementacja:
- planner wybiera tryb `parallel` (shardy) albo `sequential`.
- asystent deleguje do `Coder[1..N]` (domyslnie max 3) z rozlacznym ownership plikow.

Definicja sharda:
- `Shard allowed`, gdy: rozlaczne `owned_paths`, brak wspoldzielonego public API modyfikowanego przez >=2 shardy, brak wymagan czesciowego merge.
- `Sequence required`, gdy: zmiana obejmuje >=2 warstwy architektury w sposob sprzezony, public API wspoldzielone przez >=2 moduly, albo DB/env/deploy zalezne od kolejnosci.

3. Test:
- uruchom testy wg `factory/prompts/tester.md`,
- wygeneruj TEST_REPORT (`TEST_VERDICT: TEST_PASS | TEST_FAIL`),
- fail -> fixer -> retest (max 3 iteracje),
- kolejne niepowodzenia -> eskalacja.

4. Review loop:
- reviewer ocenia zmiany + TEST_REPORT (jesli dostepny),
- verdict: `APPROVE` albo `REQUEST_CHANGES`,
- fixer poprawia i wraca do review (max 3 iteracje),
- po 3 nieudanych iteracjach: eskalacja.

4a. Integrator gate:
- integrator = Asystent Orkiestratora (rola procesowa, bez pisania kodu),
- status: `INTEGRATION_READY` lub `INTEGRATION_BLOCKED`,
- przejscie tylko gdy wszystkie shardy maja `TEST_PASS` i `REVIEW_APPROVE`,
- fail jednego sharda blokuje finalna integracje, ale nie resetuje shardow z `PASS/APPROVE`.

5. Docs:
- aktualizacja README/API/architektury/changelog (zakres zalezy od zmiany),
- sprawdzenie spojnosci docs z kodem.

6. Commit:
- wykonywany przez Committer po `COMMIT_APPROVED`,
- v1: gate'y test/review/docs sa deklarowane przez orchestratora (`COMMIT_REQUEST`),
- v1: bezpieczny staging (bez `git add .` i `git add -A`).

### Context Gate v1 (Low-Context First)

Na starcie kazdego taska agent laduje tylko Warstwe A. Warstwy B/C sa dolaczane selektywnie.

Pre-session check v1.1:
- przed ladowaniem pelnego kontekstu wykonaj ocene budzetu (`required_context_files` vs `context_budget`).
- jesli przekroczenie jest prawdopodobne: nie startuj implementacji, uruchom rollover/replan.

Warstwa A (always-on, zawsze):
- `factory/CONCEPT.md`
- `factory/TOOL-ADAPTERS.md`
- `factory/prompts/tester.md`
- `factory/prompts/reviewer.md`

Warstwa B (task-scoped, zalezne od typu taska):
- Architektura backend: `documentation/team/architecture/clean-architecture.md`
- Testy: `documentation/team/architecture/testing-per-layer.md`
- API/kontrakty: `documentation/team/architecture/system-map.md` + `src/types/types.d.ts`
- Env/deploy/db: `documentation/team/onboarding/*` + `documentation/team/operations/*`

Warstwa C (fallback/deep dive, tylko z uzasadnieniem):
- `documentation/team/architecture/conventions/coding-server.md`
- `documentation/team/architecture/conventions/coding-client.md`
- `documentation/team/architecture/clean-architecture-details.md`
- `documentation/team/architecture/ai-decision-trees.md`

Regula:
- Zakaz ladowania Warstwy C "na dzien dobry".
- Wejscie do Warstwy C wymaga triggera: brak danych do decyzji, konflikt kontraktu, review blocker.
- runtime rollover: gdy `remaining_context_capacity <= 40%`, sesja przechodzi w handoff.

## 6. Checkpointy i eskalacja

Obowiazkowe checkpointy:
- po planie,
- po architekturze,
- finalny przed merge/release.

Eskalacja obowiazkowa, gdy:
- decyzja zmienia architekture lub interfejs publiczny,
- review/test failuja po 3 iteracjach,
- pojawia sie ryzyko bezpieczenstwa lub niejednoznaczne wymaganie.

Praktyka eskalacji v1.1:
- asystent zatrzymuje dany shard/sesje,
- publikuje `ESCALATION_REPORT` (shard_id, proby, hipoteza przyczyny, opcje A/B, rekomendacja, decyzja wymagana od czlowieka),
- czeka na decyzje czlowieka przed wznowieniem.

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
- Warstwa 2 (DONE): Test Pipeline.
- Warstwa 3 (DONE): Planner (top-down decomposition + dependency graph).
- Warstwa 4 (DONE): Auto-docs i consistency checks.
- Warstwa 5 (DONE): Committer v1.
- Warstwa 6 (NEXT): Stateful orchestration gate + orchestrator agent.

Strategia: wdrozenie warstwowe "na cebulke", bez przeskakiwania fundamentow.

Priorytet delivery:
- balans 50/50: funkcjonalnosci + refactor techniczny.
- refactor nie blokuje delivery, chyba ze dotyczy bezpieczenstwa, stabilnosci lub kontraktu API.

## 9. Mapowanie do istniejacych plikow Factory

- Status i postep: `factory/STATUS.md`
- Sesje i prompty operacyjne: `factory/PROMPTS-SESSIONS.md`
- Prompt Asystenta Orkiestratora (v1.1): `factory/prompts/orchestrator-assistant.md`
- Prompt Codera (v1.1): `factory/prompts/coder.md`
- Prompt testera (warstwa 2): `factory/prompts/tester.md`
- Prompt reviewera (warstwa 1): `factory/prompts/reviewer.md`
- Prompt committera (warstwa 5): `factory/prompts/committer.md`
- Mapa zrodel prawdy: `documentation/team/operations/docs-map.md`
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
execution_model: orchestrator_v1
main_agent_policy:
  can_edit_code: false
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
