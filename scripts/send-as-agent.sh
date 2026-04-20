#!/bin/bash
# Send a Telegram message FROM a specific agent's bot + log to hive_mind.
# Usage: send-as-agent.sh <agent_id> "message text" [action]
#
# Supported agents: tvashtar, main (Indra)
# Add more agents as you create them.
# Reads bot tokens from .env in the project root.
# Logs every message to hive_mind SQLite table for audit trail.
#
# Actions (optional, auto-detected from message):
#   task_accepted, task_completed, task_failed, task_progress
#
# Examples:
#   send-as-agent.sh tvashtar "Позвольте, я разберусь: рефакторинг API"
#   send-as-agent.sh tvashtar "Готово. Тесты подтверждают."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
DB_FILE="$SCRIPT_DIR/../store/claudeclaw.db"

if [ ! -f "$ENV_FILE" ]; then
  echo "send-as-agent.sh: .env not found at $ENV_FILE" >&2
  exit 1
fi

AGENT_ID="$1"
MESSAGE="$2"
ACTION="$3"

if [ -z "$AGENT_ID" ] || [ -z "$MESSAGE" ]; then
  echo "Usage: send-as-agent.sh <agent_id> \"message\" [action]" >&2
  echo "Agents: tvashtar, main (add more in this script)" >&2
  exit 1
fi

# Map agent_id to token env var
# Add new agents here as you create them
case "$AGENT_ID" in
  tvashtar) TOKEN_VAR="TVASHTAR_BOT_TOKEN" ;;
  main)     TOKEN_VAR="TELEGRAM_BOT_TOKEN" ;;
  *)
    # Try dynamic lookup: AGENTID_BOT_TOKEN
    UPPER_ID=$(echo "$AGENT_ID" | tr '[:lower:]' '[:upper:]')
    TOKEN_VAR="${UPPER_ID}_BOT_TOKEN"
    ;;
esac

TOKEN=$(grep -E "^${TOKEN_VAR}=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
CHAT_ID=$(grep -E '^ALLOWED_CHAT_ID=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")

if [ -z "$TOKEN" ]; then
  echo "send-as-agent.sh: $TOKEN_VAR not found in .env" >&2
  exit 1
fi

if [ -z "$CHAT_ID" ]; then
  echo "send-as-agent.sh: ALLOWED_CHAT_ID not found in .env" >&2
  exit 1
fi

# Auto-detect action from message if not provided
if [ -z "$ACTION" ]; then
  case "$MESSAGE" in
    *"Принял задачу"*|*"📋"*)  ACTION="task_accepted" ;;
    *"Задача выполнена"*|*"✅"*|*"Готово"*|*"готов"*)  ACTION="task_completed" ;;
    *"Ошибка"*|*"❌"*|*"Таймаут"*)  ACTION="task_failed" ;;
    *"Работаю"*|*"⏳"*|*"Получил данные"*)  ACTION="task_progress" ;;
    *)  ACTION="agent_message" ;;
  esac
fi

# 1. Send to Telegram
curl -s -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -d chat_id="${CHAT_ID}" \
  -d text="${MESSAGE}" > /dev/null

# 2. Log to hive_mind (if DB exists)
if [ -f "$DB_FILE" ]; then
  NOW=$(date +%s)
  # Escape single quotes in message for SQL
  SAFE_MSG=$(echo "$MESSAGE" | sed "s/'/''/g")
  sqlite3 "$DB_FILE" "INSERT INTO hive_mind (agent_id, chat_id, action, summary, artifacts, created_at) VALUES ('$AGENT_ID', '$CHAT_ID', '$ACTION', '${SAFE_MSG}', NULL, $NOW);" 2>/dev/null
fi

# 3. Update task board (board.md)
BOARD_SCRIPT="$SCRIPT_DIR/board-update.sh"
if [ -x "$BOARD_SCRIPT" ]; then
  # Extract task description (strip emoji prefixes for clean board entry)
  TASK_DESC=$(echo "$MESSAGE" | sed 's/^[📋✅❌⏳🔥🕵️🧪🐍🧪🔄 ]*//' | head -c 80)
  case "$ACTION" in
    task_accepted)  "$BOARD_SCRIPT" "$AGENT_ID" accepted "$TASK_DESC" ;;
    task_completed) "$BOARD_SCRIPT" "$AGENT_ID" done "$TASK_DESC" ;;
    task_failed)    "$BOARD_SCRIPT" "$AGENT_ID" error "$TASK_DESC" ;;
    task_progress)  "$BOARD_SCRIPT" "$AGENT_ID" working "$TASK_DESC" ;;
  esac
fi
