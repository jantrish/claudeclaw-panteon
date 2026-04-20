#!/bin/bash
# Wrapper для транскрибации через локальный Whisper
# Требуется: скрипт transcribe.sh (из AI_CENTER или собственный)
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

INPUT="$1"
if [ -z "$INPUT" ] || [ ! -f "$INPUT" ]; then
  echo ""
  exit 1
fi

# Путь к скрипту транскрибации - настройте под свою систему
TRANSCRIBE_SCRIPT="${TRANSCRIBE_SCRIPT:-$HOME/transcribe.sh}"
if [ -f "$TRANSCRIBE_SCRIPT" ]; then
  bash "$TRANSCRIBE_SCRIPT" "$INPUT" 2>/dev/null
else
  echo "⚠️ transcribe.sh not found. Set TRANSCRIBE_SCRIPT env variable." >&2
  echo ""
  exit 1
fi
