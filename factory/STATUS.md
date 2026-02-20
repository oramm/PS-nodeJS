# Factory Build Status

## Stan: Warstwa 0b — Audyt Klienta DONE
## Data: 2026-02-20

## Architektura systemu:
- SERWER: PS-nodeJS — Express.js/TypeScript backend z Clean Architecture, MariaDB, integracja Google APIs/KSeF
- KLIENT: ENVI.ProjectSite — React 18 + Bootstrap 5 + react-hook-form, Webpack, Vitest, GitHub Pages

## Co zrobiono:
- [x] Audyt struktury serwerowej (332 pliki TS, ~7600 LOC, 253 endpointy)
- [x] Analiza CLAUDE.md (327 linii, 15+ sekcji, dobrze zorganizowany)
- [x] Dokumentacja wzorców kodu serwera (Singleton Controller, BaseRepository, Validator, withAuth)
- [x] Inwentaryzacja narzędzi jakości serwera (Jest 22 testy, Prettier, TSC strict, brak ESLint/CI/CD)
- [x] Mapa API (253 endpointów REST, JSON, express-session + Google OAuth2)
- [x] Analiza git (19 branchy, mieszany format commitów PL/EN)
- [x] Audyt klienta (272 pliki TS/TSX, ~25800 LOC, React 18 + Bootstrap 5)
- [x] Analiza stack klienta (Webpack 5, Vitest, react-hook-form + yup, HashRouter)
- [x] Dokumentacja wzorców klienta (RepositoryReact, GeneralModal, FilterableTable, *Api.ts)
- [x] Inwentaryzacja testów klienta (6 plików, ~2% pokrycia, brak ESLint/Prettier/CI)
- [x] Mapa systemu serwer↔klient (endpointy, typy, auth flow, data flow)
- [ ] Reviewer agent (warstwa 1)
- [ ] Test pipeline (warstwa 2)
- [ ] Planner (warstwa 3)
- [ ] Auto-docs (warstwa 4)

## Kluczowe obserwacje:

### Serwer
- Architektura Clean Architecture jest DOBRZE UDOKUMENTOWANA (~3300 LOC instrukcji AI)
- Brak ESLint, CI/CD, pre-commit hooks — duża przestrzeń na automatyzację
- Testy istnieją (22 pliki), ale pokrycie nierówne — contractMeetingNotes najlepiej
- Dokumentacja obszerna (~9200 LOC MD), ale rozrzucona (root MD, docs/team, .github/instructions)
- Session secret prawdopodobnie hardcoded — potencjalny problem bezpieczeństwa

### Klient
- BussinesObjectSelectors.tsx (1,626 LOC) — God Component, kandydat do rozbicia
- Brak ESLint/Prettier/CI — zero automatyzacji jakości
- Dwa wzorce API (legacy RepositoryReact + nowe *Api.ts) — migracja w toku
- Typy utrzymywane ręcznie osobno od serwera — ryzyko dryfu
- ErrorBoundary nie jest prawdziwym React error boundary (window.error listener)
- Bundle ~7MB, brak code splitting
- Hardcoded production URL w kodzie

### Cross-system
- Konwencja `_` prefix spójna po obu stronach
- Brak centralnego auth middleware na serwerze (klient zabezpiecza trasy client-side)
- REST konwencje spójne (POST/find, POST/add, PUT/edit, DELETE)
- Cookie session działa poprawnie (credentials: "include" ↔ connect.sid)

## Rekomendacja dla sesji 1 (Reviewer Agent):
Agent powinien skupić się na:
1. Spójność typów klient↔serwer (wykrywanie dryfu)
2. Wzorce Clean Architecture na serwerze (łamanie reguł)
3. God Components na kliencie (ponad 500 LOC)
4. Brak auth guard na serwerze
5. Delete bez retry na kliencie

## Następny krok:
Sesja 1 — Reviewer Agent
Prompt: patrz factory/PROMPTS-SESSIONS.md
