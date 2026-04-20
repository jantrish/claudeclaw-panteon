#!/bin/bash
# ── Pantheon Backup Script ─────────────────────────────────────────────────
# Ежедневный бэкап данных проекта ClaudeClaw Pantheon.
# Хранит последние 7 бэкапов, старые удаляет.

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"
DATE=$(date "+%Y-%m-%d_%H-%M")
BACKUP_FILE="$BACKUP_DIR/pantheon-backup-$DATE.tar.gz"
MAX_BACKUPS=7

mkdir -p "$BACKUP_DIR"

# Что бэкапим:
# 1. SQLite база (store/claudeclaw.db) - вся память, сессии, hive_mind, задачи
# 2. Агенты (agents/) - конфиги, CLAUDE.md каждого агента
# 3. Главный CLAUDE.md (.claudeclaw/CLAUDE.md) - личность координатора
# 4. .env - токены, ключи (архив должен быть защищён!)
# 5. Конфиги проекта - package.json, tsconfig, .claude/settings.json
# 6. Скрипты (scripts/) - вспомогательные скрипты
# 7. LaunchAgent plist-ы агентов
# 8. Миграции (migrations/) - схема БД

TEMP_DIR=$(mktemp -d)
COLLECT="$TEMP_DIR/pantheon-backup"
mkdir -p "$COLLECT"

echo "$(date '+%Y-%m-%d %H:%M:%S') Starting Pantheon backup..."

# 1. SQLite база - используем .backup для консистентности
DB_FILE="$PROJECT_ROOT/store/claudeclaw.db"
if [ -f "$DB_FILE" ]; then
    mkdir -p "$COLLECT/store"
    sqlite3 "$DB_FILE" ".backup '$COLLECT/store/claudeclaw.db'" 2>/dev/null
    if [ $? -ne 0 ]; then
        cp "$DB_FILE" "$COLLECT/store/claudeclaw.db" 2>/dev/null
        echo "  WARN: sqlite3 .backup failed, used cp fallback"
    fi
    echo "  OK: database backed up"
else
    echo "  SKIP: no database found at $DB_FILE"
fi

# 2. Агенты - конфиги и CLAUDE.md
if [ -d "$PROJECT_ROOT/agents" ]; then
    mkdir -p "$COLLECT/agents"
    for agent_dir in "$PROJECT_ROOT/agents"/*/; do
        agent_name=$(basename "$agent_dir")
        mkdir -p "$COLLECT/agents/$agent_name"
        cp "$agent_dir/agent.yaml" "$COLLECT/agents/$agent_name/" 2>/dev/null
        cp "$agent_dir/CLAUDE.md" "$COLLECT/agents/$agent_name/" 2>/dev/null
    done
    echo "  OK: agents backed up"
fi

# 3. Главный CLAUDE.md
if [ -f "$PROJECT_ROOT/.claudeclaw/CLAUDE.md" ]; then
    mkdir -p "$COLLECT/claudeclaw-config"
    cp "$PROJECT_ROOT/.claudeclaw/CLAUDE.md" "$COLLECT/claudeclaw-config/" 2>/dev/null
    echo "  OK: main CLAUDE.md backed up"
fi

# 4. .env (содержит секреты - архив должен быть защищён!)
if [ -f "$PROJECT_ROOT/.env" ]; then
    mkdir -p "$COLLECT/config"
    cp "$PROJECT_ROOT/.env" "$COLLECT/config/.env" 2>/dev/null
    echo "  OK: .env backed up (PROTECT THIS FILE!)"
fi

# 5. Конфиги проекта
mkdir -p "$COLLECT/config"
cp "$PROJECT_ROOT/package.json" "$COLLECT/config/" 2>/dev/null
cp "$PROJECT_ROOT/tsconfig.json" "$COLLECT/config/" 2>/dev/null
cp "$PROJECT_ROOT/.claude/settings.json" "$COLLECT/config/project-settings.json" 2>/dev/null
echo "  OK: project configs backed up"

# 6. Скрипты
if [ -d "$PROJECT_ROOT/scripts" ]; then
    mkdir -p "$COLLECT/scripts"
    cp "$PROJECT_ROOT/scripts"/*.sh "$COLLECT/scripts/" 2>/dev/null
    cp "$PROJECT_ROOT/scripts"/*.ts "$COLLECT/scripts/" 2>/dev/null
    echo "  OK: scripts backed up"
fi

# 7. LaunchAgent plist-ы агентов
mkdir -p "$COLLECT/launchd"
for plist in "$HOME/Library/LaunchAgents/com.claudeclaw.agent-"*.plist; do
    [ -f "$plist" ] && cp "$plist" "$COLLECT/launchd/" 2>/dev/null
done
echo "  OK: launchd plists backed up"

# 8. Миграции
if [ -d "$PROJECT_ROOT/migrations" ]; then
    mkdir -p "$COLLECT/migrations"
    cp "$PROJECT_ROOT/migrations"/*.sql "$COLLECT/migrations/" 2>/dev/null
    echo "  OK: migrations backed up"
fi

# 9. Skills index
if [ -f "$PROJECT_ROOT/.claudeclaw/skills-index.md" ]; then
    cp "$PROJECT_ROOT/.claudeclaw/skills-index.md" "$COLLECT/claudeclaw-config/" 2>/dev/null
fi

# ── Архивируем ────────────────────────────────────────────────────────────
tar -czf "$BACKUP_FILE" -C "$TEMP_DIR" "pantheon-backup" 2>/dev/null

# Чистим temp
rm -rf "$TEMP_DIR"

# Проверяем результат
if [ -f "$BACKUP_FILE" ]; then
    SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
    echo "$(date '+%Y-%m-%d %H:%M:%S') SUCCESS: $BACKUP_FILE ($SIZE)"

    # Удаляем старые бэкапы (оставляем последние MAX_BACKUPS)
    BACKUPS_COUNT=$(ls -1 "$BACKUP_DIR"/pantheon-backup-*.tar.gz 2>/dev/null | wc -l | tr -d ' ')
    if [ "$BACKUPS_COUNT" -gt "$MAX_BACKUPS" ]; then
        ls -1t "$BACKUP_DIR"/pantheon-backup-*.tar.gz | tail -n +$((MAX_BACKUPS + 1)) | while read old; do
            rm -f "$old"
            echo "  Deleted old: $(basename "$old")"
        done
    fi
else
    echo "$(date '+%Y-%m-%d %H:%M:%S') FAIL: backup not created" >&2
    exit 1
fi
