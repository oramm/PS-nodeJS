# Prompty na kolejne sesje fabryki

## Sesja 0b: Audyt Klienta

```
Kontynuuję wdrażanie "Dark Code Factory".
Metoda: warstwowa ("na cebulkę") — jedna warstwa na raz.

KONTEKST:
- SERWER (PS-nodeJS) został już zaudytowany → przeczytaj factory/AUDIT-SERVER.md
- Teraz audytujemy KLIENTA (frontend)
- Klient: C:\Apache24\htdocs\ENVI.ProjectSite

WAŻNE: Przeczytaj NAJPIERW plik C:\Apache24\htdocs\PS-nodeJS\factory\AUDIT-SERVER.md
żeby znać kontekst serwera (API, formaty danych, auth).

═══════════════════════════════════════════════════════
WARSTWA 0b: AUDYT KLIENTA
═══════════════════════════════════════════════════════

WYKONAJ PO KOLEI:

1. STRUKTURA PROJEKTU KLIENTA
   - Wylistuj główne katalogi (drzewo 2 poziomy)
   - Policz pliki źródłowe, szacunkowe LOC
   - Zidentyfikuj: framework UI, bundler, state management, routing

2. STACK TECHNOLOGICZNY
   - package.json: zależności, scripts
   - Konfiguracja TS/JS
   - Bundler config (webpack/vite/inne)
   - Formatter/linter

3. WZORCE KODU KLIENTA
   Przejrzyj 5-8 różnych plików.
   Zanotuj:
   - Struktura komponentów (jak zorganizowane?)
   - Jak wywoływane API serwera?
   - State management
   - Routing
   - Nazewnictwo (konwencje)
   - Error handling po stronie klienta

4. POŁĄCZENIE SERWER ↔ KLIENT
   Na podstawie OBIE stron:
   - Jak klient wywołuje endpointy serwera?
   - Czy jest wspólna definicja typów?
   - Jak obsługiwana sesja/auth po stronie klienta?
   - Jak obsługiwane pliki/upload?
   - Czy są jakieś niespójności w konwencjach?

5. TESTY I JAKOŚĆ (KLIENT)
   - Czy są testy? Gdzie?
   - Linter? Formatter?
   - Build pipeline?

6. ZAPIS WYNIKÓW
   a) Stwórz C:\Apache24\htdocs\PS-nodeJS\factory\AUDIT-CLIENT.md
      (pełne wyniki, analogicznie do AUDIT-SERVER.md)

   b) Stwórz C:\Apache24\htdocs\PS-nodeJS\factory\SYSTEM-MAP.md
      Mapa połączeń serwer ↔ klient:
      - Które endpointy serwera używane przez klienta
      - Wspólne typy/interfejsy
      - Flow autentykacji end-to-end
      - Diagram przepływu danych

   c) Zaktualizuj factory/STATUS.md
      (odznacz kroki 0b, dodaj rekomendacje)

   d) Uzupełnij prompt na sesję 1 w PROMPTS-SESSIONS.md

7. NIE MODYFIKUJ istniejącego kodu.
   Tylko CZYTAJ i DOKUMENTUJ.

8. COMMIT: "docs(factory): warstwa 0b — audyt klienta"
```

## Sesja 1: Reviewer Agent
[placeholder — uzupełnimy po audycie klienta, gdy będziemy mieć pełny obraz systemu]

## Sesja 2: Test Pipeline
[placeholder]

## Sesja 3: Planner
[placeholder]

## Sesja 4: Auto-docs
[placeholder]
