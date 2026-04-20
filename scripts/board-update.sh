#!/bin/bash
# Update task board (data/board.md) with task status changes.
# Usage: board-update.sh <agent_id> <status> "task description"
#
# Statuses: new, accepted, working, done, error
# Emojis:   📋    ⏳        🔄       ✅     ❌
#
# Examples:
#   board-update.sh tvashtar accepted "Рефакторинг API модуля"
#   board-update.sh tvashtar done "Unit-тесты для auth"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOARD_FILE="$SCRIPT_DIR/../data/board.md"

AGENT_ID="$1"
STATUS="$2"
TASK="$3"

if [ -z "$AGENT_ID" ] || [ -z "$STATUS" ] || [ -z "$TASK" ]; then
  echo "Usage: board-update.sh <agent_id> <new|accepted|working|done|error> \"task\"" >&2
  exit 1
fi

# Map agent to emoji - add new agents here
case "$AGENT_ID" in
  tvashtar) AGENT_EMOJI="⚒️ Тваштар" ;;
  indra)    AGENT_EMOJI="⚡ Индра" ;;
  manas)    AGENT_EMOJI="💨 Манас" ;;
  kama)     AGENT_EMOJI="🎯 Кама" ;;
  dharma)   AGENT_EMOJI="⚖️ Дхарма" ;;
  main)     AGENT_EMOJI="⚡ Координатор" ;;
  *)        AGENT_EMOJI="$AGENT_ID" ;;
esac

# Map status to emoji
case "$STATUS" in
  new)      STATUS_TEXT="📋 НОВАЯ" ;;
  accepted) STATUS_TEXT="⏳ ВЗЯЛ" ;;
  working)  STATUS_TEXT="🔄 В РАБОТЕ" ;;
  done)     STATUS_TEXT="✅ ГОТОВО" ;;
  error)    STATUS_TEXT="❌ ОШИБКА" ;;
  *)        STATUS_TEXT="$STATUS" ;;
esac

NOW=$(date +"%H:%M")

# Create board file if doesn't exist
if [ ! -f "$BOARD_FILE" ]; then
  mkdir -p "$(dirname "$BOARD_FILE")"
  cat > "$BOARD_FILE" << 'HEADER'
# 📋 Task Board - Пантеон

## Активные задачи

*Нет активных задач*

## История (последние)

| Время | Агент | Задача | Статус |
|-------|-------|--------|--------|
HEADER
fi

# Append to history table
echo "| $NOW | $AGENT_EMOJI | $TASK | $STATUS_TEXT |" >> "$BOARD_FILE"

# Update timestamp
sed -i '' "s/^> Последнее обновление:.*/> Последнее обновление: $(date +'%Y-%m-%d %H:%M')/" "$BOARD_FILE" 2>/dev/null
