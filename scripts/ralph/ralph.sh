#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# RALPH LOOP - Automatyczny Agent Kodujący v2.0
# Lokalizacja: /scripts/ralph/ralph.sh
# ═══════════════════════════════════════════════════════════════

# ŚCIEŻKI (względem roota projektu)
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PRD_FILE="$PROJECT_ROOT/prd.md"
PROGRESS_FILE="$PROJECT_ROOT/progress.md"

# KONFIGURACJA
MAX_RETRIES=${1:-10}
PAUSE_BETWEEN=5

# FUNKCJE
count_remaining() { grep -c "\- \[ \]" "$PRD_FILE" 2>/dev/null || echo 0; }
count_completed() { grep -c "\- \[x\]" "$PRD_FILE" 2>/dev/null || echo 0; }
timestamp() { date "+%Y-%m-%d %H:%M:%S"; }

# WALIDACJA
echo "═══════════════════════════════════════════════════════════"
echo "        RALPH LOOP - Automatyczny Agent"
echo "═══════════════════════════════════════════════════════════"
echo "📂 Projekt: $PROJECT_ROOT"

if [ ! -f "$PRD_FILE" ]; then
    echo "❌ Brak pliku $PRD_FILE"; exit 1
fi

if ! command -v claude &> /dev/null; then
    echo "❌ Claude Code nie zainstalowany"; exit 1
fi

[ ! -f "$PROGRESS_FILE" ] && echo "# Progress Log - $(timestamp)" > "$PROGRESS_FILE"

echo "📋 Max prób: $MAX_RETRIES | Zadań: $(count_remaining)"
echo "═══════════════════════════════════════════════════════════"

# PRZEJDŹ DO ROOTA (żeby Claude działał w kontekście projektu)
cd "$PROJECT_ROOT"

# GŁÓWNA PĘTLA
CURRENT_TASK=""
RETRY_COUNT=0

while true; do
    TASK=$(grep -m 1 "\- \[ \]" "$PRD_FILE")
    
    if [ -z "$TASK" ]; then
        echo ""; echo "✅ WSZYSTKIE ZADANIA WYKONANE!"
        echo "## $(timestamp) - ZAKOŃCZONO" >> "$PROGRESS_FILE"
        break
    fi
    
    if [ "$TASK" != "$CURRENT_TASK" ]; then
        CURRENT_TASK="$TASK"
        RETRY_COUNT=1
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
    fi
    
    if [ $RETRY_COUNT -gt $MAX_RETRIES ]; then
        echo "❌ LIMIT $MAX_RETRIES PRÓB - oznaczam [F]"
        TASK_TEXT=$(echo "$CURRENT_TASK" | sed 's/- \[ \] //')
        sed "s/- \[ \] ${TASK_TEXT}/- [F] ${TASK_TEXT}/" "$PRD_FILE" > tmp.md && mv tmp.md "$PRD_FILE"
        echo "## $(timestamp) - FAILED: $TASK_TEXT" >> "$PROGRESS_FILE"
        CURRENT_TASK=""
        continue
    fi
    
    echo ""
    echo "───────────────────────────────────────────────────────────"
    echo "📌 $TASK"
    echo "   Próba: $RETRY_COUNT/$MAX_RETRIES | Pozostało: $(count_remaining)"
    echo "───────────────────────────────────────────────────────────"
    
    RECENT_PROGRESS=$(tail -30 "$PROGRESS_FILE")
    
    PROMPT="Tryb RALPH LOOP - autonomiczny agent.

ZADANIE DO WYKONANIA:
$TASK

KONTEKST (ostatnie wpisy progress.md):
$RECENT_PROGRESS

INSTRUKCJE:
1. Analizuj poprzednie próby - NIE powtarzaj błędów
2. UŻYWAJ TYLKO 'yarn' (nie npm!)
3. Wykonaj zadanie - koduj, testuj
4. PO SUKCESIE:
   - Zamień '- [ ]' na '- [x]' w prd.md
   - Dopisz log do progress.md
5. PO BŁĘDZIE:
   - NIE zaznaczaj ukończone
   - Zapisz błąd w progress.md
   - Zakończ (skrypt ponowi próbę)"

    echo "🤖 Start Claude (sesja $RETRY_COUNT)..."
    
    claude -p "$PROMPT" --allowedTools "Bash(git:*),Bash(yarn:*),Bash(npx:*),Bash(mkdir:*),Bash(cat:*),Bash(ls:*),Bash(cp:*),Bash(mv:*),Bash(rm:*),Read,Write,Edit,Grep,Glob"
    
    [ $? -ne 0 ] && echo "### $(timestamp) - Próba $RETRY_COUNT błąd" >> "$PROGRESS_FILE"
    
    echo "⏳ Pauza ${PAUSE_BETWEEN}s..."
    sleep $PAUSE_BETWEEN
done

echo ""
echo "📊 PODSUMOWANIE: ✅$(count_completed) | ❌$(count_remaining)"