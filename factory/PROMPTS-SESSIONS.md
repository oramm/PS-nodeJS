# Prompty na kolejne sesje fabryki

## Sesja 0b: Audyt Klienta ✅ DONE

```
[wykonano — wyniki w factory/AUDIT-CLIENT.md i factory/SYSTEM-MAP.md]
```

## Sesja 1: Reviewer Agent

```
Kontynuuję wdrażanie "Dark Code Factory".
Metoda: warstwowa ("na cebulkę") — jedna warstwa na raz.

KONTEKST:
- Serwer zaudytowany → factory/AUDIT-SERVER.md
- Klient zaudytowany → factory/AUDIT-CLIENT.md
- Mapa systemu → factory/SYSTEM-MAP.md
- Status → factory/STATUS.md

═══════════════════════════════════════════════════════
WARSTWA 1: REVIEWER AGENT
═══════════════════════════════════════════════════════

Przeczytaj NAJPIERW wszystkie pliki factory/*.md żeby znać pełny kontekst.

CEL: Stworzyć agenta-reviewera, który automatycznie sprawdza kod
pod kątem spójności z architekturą i konwencjami projektu.

ZAKRES REVIEWERA:

1. SERWER (PS-nodeJS) — Clean Architecture compliance:
   - Flow: Router → Validator → Controller → Repository → Model
   - Singleton pattern w Controllerach
   - Brak logiki biznesowej w Repository
   - Brak I/O w Model
   - Standardowe nazwy CRUD (find, addFromDto, add, editFromDto, edit, delete)
   - Konwencja _ prefix dla pól relacyjnych

2. KLIENT (ENVI.ProjectSite) — wzorce i jakość:
   - God Components (pliki > 500 LOC)
   - Spójność wzorca API (RepositoryReact vs *Api.ts)
   - Poprawność typów w bussinesTypes.d.ts (duplikaty, unused imports)
   - Error handling (fetchWithRetry wszędzie?)
   - Poprawność ErrorBoundary

3. CROSS-SYSTEM — spójność klient↔serwer:
   - Drift typów (interfejsy klienta vs model serwera)
   - Matchowanie tras (actionRoutes klienta vs endpointy serwera)
   - Konwencje nazewnictwa pól

DELIVERABLES:
a) Skrypt/agent który wykonuje powyższe sprawdzenia
b) Raport z wynikami
c) Aktualizacja factory/STATUS.md

NIE MODYFIKUJ istniejącego kodu aplikacji.
COMMIT: "feat(factory): warstwa 1 — reviewer agent"
```

## Sesja 2: Test Pipeline
[placeholder — uzupełnimy po reviewer agent]

## Sesja 3: Planner
[placeholder]

## Sesja 4: Auto-docs
[placeholder]
