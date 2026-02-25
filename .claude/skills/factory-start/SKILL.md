---
name: factory-start
description: >
  Wypisuje gotowy prompt startowy Dark Factory dla wybranego narzędzia.
  Używaj gdy zaczynasz nową sesję fabryki i potrzebujesz skopiować one-liner.
  Wywołanie: /factory-start [claude|codex|copilot] (domyślnie: claude)
---

# Factory Start

1. Odczytaj plik `factory/PROMPTS-SESSIONS.md`.

2. Wyznacz wariant na podstawie argumentu (case-insensitive, trim whitespace):
   - brak argumentu, `claude`, `claude-code` → sekcja **### Claude Code**
   - `codex`                                 → sekcja **### Codex**
   - `copilot`                               → sekcja **### Copilot VS Code**
   - dowolna inna wartość                    → wypisz:
     ```
     Nieznany wariant: "<arg>". Dozwolone: claude, codex, copilot.
     ```
     i zakończ (nie wypisuj żadnego prompta).

3. Z wybranej sekcji wyodrębnij TYLKO treść bloku ```text ... ```.

4. Wypisz dokładnie jeden blok kodu:
   ```text
   <treść prompta>
   ```
   Bez żadnych komentarzy, nagłówków ani dodatkowego tekstu przed ani po bloku.
