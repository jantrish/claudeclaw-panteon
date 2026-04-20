#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════
# delegate-to-agent.sh - Делегация задачи агенту через оркестратор
#
# Вызывает daemon API (POST /api/delegate) который загружает CLAUDE.md агента,
# запускает на его модели, отправляет Telegram от его бота,
# логирует в hive_mind и inter_agent_tasks.
#
# Usage:
#   delegate-to-agent.sh <agent_id> "prompt text" [timeout_ms]
#   delegate-to-agent.sh --parallel '<json_tasks>' [timeout_ms]
#
# Single agent:
#   delegate-to-agent.sh tvashtar "Сделай code review файла src/bot.ts"
#
# Parallel (JSON):
#   delegate-to-agent.sh --parallel '[
#     {"agentId":"tvashtar","prompt":"Напиши тесты"}
#   ]'
#
# Agents (add more as you create them):
#   tvashtar - Тваштар (Opus) - программист-перфекционист
#
# Returns: agent's response text (stdout), exit code 0 on success
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env not found at $ENV_FILE" >&2
  exit 1
fi

# Read config from .env
DASHBOARD_TOKEN=$(grep -E '^DASHBOARD_TOKEN=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
DASHBOARD_PORT=$(grep -E '^DASHBOARD_PORT=' "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "3142")

if [ -z "$DASHBOARD_PORT" ]; then
  DASHBOARD_PORT=3142
fi

if [ -z "$DASHBOARD_TOKEN" ]; then
  echo "ERROR: DASHBOARD_TOKEN not found in .env" >&2
  exit 1
fi

BASE_URL="http://localhost:${DASHBOARD_PORT}"

# ── Parallel mode ──
if [ "${1:-}" = "--parallel" ]; then
  TASKS_JSON="${2:-}"
  TIMEOUT_MS="${3:-600000}"

  if [ -z "$TASKS_JSON" ]; then
    echo "Usage: delegate-to-agent.sh --parallel '<json_tasks>' [timeout_ms]" >&2
    exit 1
  fi

  # Build request body
  BODY=$(cat <<EOJSON
{"tasks":${TASKS_JSON},"timeoutMs":${TIMEOUT_MS}}
EOJSON
)

  RESPONSE=$(curl -s -X POST \
    "${BASE_URL}/api/delegate/parallel?token=${DASHBOARD_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    --max-time $((TIMEOUT_MS / 1000 + 30)))

  # Check if response is valid JSON
  if ! echo "$RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    echo "ERROR: Invalid response from daemon. Is it running?" >&2
    echo "$RESPONSE" >&2
    exit 1
  fi

  # Check ok field
  OK=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))")
  if [ "$OK" != "True" ]; then
    ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error', 'Unknown error'))")
    echo "ERROR: $ERROR" >&2
    exit 1
  fi

  # Output full JSON results (caller parses what they need)
  echo "$RESPONSE"
  exit 0
fi

# ── Single agent mode ──
AGENT_ID="${1:-}"
PROMPT="${2:-}"
TIMEOUT_MS="${3:-600000}"

if [ -z "$AGENT_ID" ] || [ -z "$PROMPT" ]; then
  echo "Usage: delegate-to-agent.sh <agent_id> \"prompt\" [timeout_ms]" >&2
  echo "       delegate-to-agent.sh --parallel '<json_tasks>' [timeout_ms]" >&2
  echo "" >&2
  echo "Agents: tvashtar (Opus). Add more as you create them." >&2
  exit 1
fi

# ── Resolve agent-specific dashboard port ──
resolve_agent_port() {
  local agent_id="$1"
  local agent_yaml="$SCRIPT_DIR/../agents/${agent_id}/agent.yaml"
  if [ -f "$agent_yaml" ]; then
    local port=$(grep -E '^dashboard_port:' "$agent_yaml" | awk '{print $2}' | tr -d '"' | tr -d "'")
    if [ -n "$port" ]; then
      echo "$port"
      return
    fi
  fi
  echo "$DASHBOARD_PORT"
}

AGENT_PORT=$(resolve_agent_port "$AGENT_ID")
AGENT_URL="http://localhost:${AGENT_PORT}"

# Escape prompt for JSON (handle quotes, newlines, backslashes)
ESCAPED_PROMPT=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read().strip()))" <<< "$PROMPT")

# Build request body
BODY="{\"agentId\":\"${AGENT_ID}\",\"prompt\":${ESCAPED_PROMPT},\"timeoutMs\":${TIMEOUT_MS}}"

# Try agent's own dashboard first (3s connect timeout), fallback to main
RESPONSE=$(curl -s --connect-timeout 3 -X POST \
  "${AGENT_URL}/api/delegate?token=${DASHBOARD_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  --max-time $((TIMEOUT_MS / 1000 + 30)) 2>/dev/null)

# If agent unreachable or invalid response, fallback to main dashboard
if [ -z "$RESPONSE" ] || ! echo "$RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  echo "INFO: Agent dashboard unreachable on port $AGENT_PORT, falling back to main ($DASHBOARD_PORT)" >&2
  RESPONSE=$(curl -s -X POST \
    "${BASE_URL}/api/delegate?token=${DASHBOARD_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$BODY" \
    --max-time $((TIMEOUT_MS / 1000 + 30)))
fi

# Check if response is valid JSON
if ! echo "$RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  echo "ERROR: Invalid response from daemon. Is it running on port ${DASHBOARD_PORT}?" >&2
  echo "$RESPONSE" >&2
  exit 1
fi

# Parse response
OK=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok', False))")

if [ "$OK" = "True" ]; then
  # Extract result text
  RESULT_TEXT=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
text = data.get('result', {}).get('text', '')
if text:
    print(text)
else:
    print('[No response from agent]')
")
  DURATION=$(echo "$RESPONSE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
ms = data.get('result', {}).get('durationMs', 0)
print(f'{ms/1000:.1f}s')
")

  echo "$RESULT_TEXT"
  echo "" >&2
  echo "--- Agent: $AGENT_ID | Duration: $DURATION ---" >&2
  exit 0
else
  ERROR=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('error', 'Unknown error'))")
  echo "ERROR: Delegation to $AGENT_ID failed: $ERROR" >&2
  exit 1
fi
