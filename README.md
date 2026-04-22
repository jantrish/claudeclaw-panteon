# ClaudeClaw Пантеон

> Пантеон ведических богов-агентов на Claude Code. Каждый бог - своя роль, свой характер, своя задача.

---

## Что это

**Пантеон** - это система AI-агентов, где каждый агент назван в честь ведического божества и выполняет свою роль. Как в древнем пантеоне у каждого бога была своя сфера ответственности - так и здесь: один пишет код, другой ведёт маркетинг, третий проверяет качество.

Построен на [ClaudeClaw](https://github.com/earlyaidopters/claudeclaw) - обёртке вокруг Claude Code CLI. **Не чат-бот.** Агенты запускают настоящий `claude` CLI на твоём Mac/Linux и отправляют результат в Telegram. Все твои файлы, скиллы и инструменты - доступны с телефона.

**Начинаем с одного бога - растём до пантеона.** В этом репозитории уже развёрнут первый агент - **Тваштар**, божественный кузнец и программист-перфекционист. Когда освоишься - добавишь других богов. Инфраструктура готова.

---

## Тваштар - первый агент

| | |
|---|---|
| **Имя** | Тваштар (ведический божественный кузнец) |
| **Роль** | Программист-перфекционист |
| **Модель** | Claude Opus (самая мощная) |
| **Что умеет** | Код, архитектура, тесты, рефакторинг, деплой, автоматизация |
| **Характер** | Спокойный, методичный, перфекционист |
| **Девиз** | "99.1% чистоты формы" |

---

## Требования

| Требование | Где взять | Проверка |
|------------|-----------|----------|
| Mac или Linux | - | `uname` |
| Node.js 20+ | [nodejs.org](https://nodejs.org) | `node --version` |
| npm | Идёт с Node.js | `npm --version` |
| Claude Code CLI | `npm i -g @anthropic-ai/claude-code` | `claude --version` |
| Claude аккаунт | [claude.ai](https://claude.ai) (Max с Opus рекомендуем) | `claude login` |
| Telegram | Любой аккаунт | - |

---

## Установка за 5 минут (ручная)

### Шаг 1. Создай Telegram-бота

Открой [@BotFather](https://t.me/botfather) в Telegram:
1. Напиши `/newbot`
2. Дай имя (например: "Тваштар")
3. Дай username (например: `my_tvashtar_bot`)
4. Сохрани токен (формат: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Шаг 2. Узнай свой Telegram ID

Напиши [@userinfobot](https://t.me/userinfobot) в Telegram - он ответит числом (например: `213822023`). Сохрани.

### Шаг 3. Клонируй и установи

```bash
git clone https://github.com/jantrish/claudeclaw-pantheon.git
cd claudeclaw-pantheon
npm install
```

### Шаг 4. Создай файл .env

```bash
cp .env.example .env
```

Открой `.env` и заполни **два обязательных поля**:
```env
TVASHTAR_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
ALLOWED_CHAT_ID=213822023
```

### Шаг 5. Залогинься в Claude Code

```bash
claude login
```

Откроется браузер для авторизации. После успешного входа - возвращайся в терминал.

### Шаг 6. Собери и запусти

```bash
npm run build
npm run agent:start tvashtar
```

### Шаг 7. Проверь

Напиши своему боту в Telegram. Если отвечает - всё работает!

---

## Автоматическая установка через Claude Code

Если ты уже в Claude Code - просто выполни эти инструкции:

```bash
git clone https://github.com/jantrish/claudeclaw-pantheon.git
cd claudeclaw-pantheon
claude
```

И скажи Claude:
> Прочитай README.md. Разверни проект полностью. Я дам тебе токен бота и Telegram ID.

### Что Claude Code должен сделать при разворачивании:

1. **Проверить окружение:**
   ```bash
   node --version    # Должно быть >= 20
   npm --version     # Любая
   claude --version  # Должен быть установлен
   ```

2. **Установить зависимости:**
   ```bash
   npm install
   ```

3. **Создать .env из шаблона:**
   ```bash
   cp .env.example .env
   ```

4. **Спросить у пользователя два значения:**
   - `TVASHTAR_BOT_TOKEN` - токен от @BotFather (формат: `числа:буквы`)
   - `ALLOWED_CHAT_ID` - Telegram ID пользователя (число)

5. **Записать их в .env:**
   ```bash
   sed -i '' "s/^TVASHTAR_BOT_TOKEN=.*/TVASHTAR_BOT_TOKEN=ПОЛУЧЕННЫЙ_ТОКЕН/" .env
   sed -i '' "s/^ALLOWED_CHAT_ID=.*/ALLOWED_CHAT_ID=ПОЛУЧЕННЫЙ_ID/" .env
   ```

6. **Собрать TypeScript:**
   ```bash
   npm run build
   ```
   Ожидаемый результат: папка `dist/` с .js файлами, 0 ошибок.

7. **Проверить что Claude Code CLI авторизован:**
   ```bash
   claude --version
   ```
   Если не авторизован - попросить пользователя выполнить `claude login`.

8. **Запустить агента:**
   ```bash
   npm run agent:start tvashtar
   ```
   Это запускает Node.js процесс который:
   - Подключается к Telegram через long-polling (grammy)
   - Слушает сообщения от ALLOWED_CHAT_ID
   - При получении сообщения вызывает Claude Code SDK
   - Отправляет ответ обратно в Telegram

9. **Проверить работу:**
   - Бот должен отвечать на сообщения в Telegram
   - В логах не должно быть ошибок
   - `npm run status` показывает здоровье системы

10. **Опционально - настроить автозапуск (launchd на macOS):**
    ```bash
    # Создать plist для автозапуска при логине
    cat > ~/Library/LaunchAgents/com.claudeclaw.agent-tvashtar.plist << 'EOF'
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <dict>
      <key>Label</key>
      <string>com.claudeclaw.agent-tvashtar</string>
      <key>ProgramArguments</key>
      <array>
        <string>NODE_PATH</string>
        <string>PROJECT_DIR/dist/index.js</string>
        <string>--agent</string>
        <string>tvashtar</string>
      </array>
      <key>WorkingDirectory</key>
      <string>PROJECT_DIR</string>
      <key>RunAtLoad</key>
      <true/>
      <key>KeepAlive</key>
      <true/>
      <key>StandardOutPath</key>
      <string>PROJECT_DIR/logs/tvashtar.log</string>
      <key>StandardErrorPath</key>
      <string>PROJECT_DIR/logs/tvashtar.err</string>
      <key>EnvironmentVariables</key>
      <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>HOME_DIR</string>
      </dict>
    </dict>
    </plist>
    EOF

    # Заменить плейсхолдеры на реальные пути
    # NODE_PATH = $(which node)
    # PROJECT_DIR = $(pwd)
    # HOME_DIR = $HOME

    # Загрузить и запустить
    launchctl load ~/Library/LaunchAgents/com.claudeclaw.agent-tvashtar.plist
    ```

---

## Архитектура системы

### Как работает агент

```
Пользователь в Telegram
        │
        ▼
[Telegram Bot API] (long-polling через grammy)
        │
        ▼
[src/bot.ts] - обработка сообщений
        │
        ├─ Авторизация (ALLOWED_CHAT_ID)
        ├─ Загрузка контекста памяти (SQLite)
        ├─ Обработка команд (/newchat, /voice, /model)
        │
        ▼
[src/agent.ts] - вызов Claude Code SDK
        │
        ├─ Загружает CLAUDE.md агента (agents/tvashtar/CLAUDE.md)
        ├─ Загружает скиллы (skills/)
        ├─ Запускает claude CLI как subprocess
        ├─ Передаёт сообщение + memory context
        ├─ Получает результат + usage stats
        │
        ▼
[Ответ в Telegram]
        │
        ├─ Разбивает на чанки (max 4096 символов)
        ├─ Обрабатывает [SEND_FILE:...] маркеры
        └─ Сохраняет в memory (async)
```

### Ключевые файлы

| Файл | Назначение |
|------|-----------|
| `src/index.ts` | Entry point. Определяет agent_id, инициализирует всё |
| `src/bot.ts` | Telegram handler. Команды, сообщения, файлы |
| `src/agent.ts` | Обёртка Claude Code SDK. Запуск, resume session |
| `src/config.ts` | Конфигурация. Env vars, agent overrides |
| `src/agent-config.ts` | Парсинг agent.yaml, discovery агентов |
| `src/db.ts` | SQLite. Схема, запросы, шифрование |
| `src/memory.ts` | Система памяти. Context builder, decay |
| `src/orchestrator.ts` | Делегация между агентами |
| `src/dashboard.ts` | Web UI мониторинга (Hono) |
| `src/scheduler.ts` | Cron-задачи |
| `src/voice.ts` | Голосовые сообщения (Whisper + TTS) |

### Конфигурация агента

**`agents/tvashtar/agent.yaml`** - определяет:
```yaml
name: Tvashtar                        # Отображаемое имя
description: Программист-перфекционист # Описание роли
telegram_bot_token_env: TVASHTAR_BOT_TOKEN  # Имя env-переменной с токеном
model: claude-opus-4-6                # Модель Claude (opus/sonnet/haiku)
dashboard_port: 3145                  # Порт web-панели мониторинга
skills:                               # Список доступных скиллов
  - systematic-debugging
  - quality-check
  - ...
```

**`agents/tvashtar/CLAUDE.md`** - характер и инструкции агента. Это system prompt который загружается в каждую сессию Claude Code.

### База данных

SQLite файл `store/claudeclaw.db` создаётся автоматически при первом запуске. Таблицы:

| Таблица | Назначение |
|---------|-----------|
| `sessions` | Состояние сессий Claude Code (для resume) |
| `memories` | Семантическая память (факты, решения) |
| `consolidations` | Сжатые паттерны из памяти |
| `conversation_log` | История переписки |
| `token_usage` | Расход токенов, стоимость |
| `hive_mind` | Лог действий агентов (для мультиагентности) |
| `inter_agent_tasks` | Задачи между агентами |
| `scheduled_tasks` | Cron-задачи |

### Сессии и контекст

- Каждое сообщение продолжает предыдущую сессию Claude Code (`resume: sessionId`)
- Контекст сохраняется между сообщениями (не нужно повторять)
- При заполнении 80% контекстного окна - автоматический reset с handoff-snapshot
- `/newchat` - ручной reset (создаёт snapshot ключевых моментов)

---

## Структура проекта (полная)

```
claudeclaw-pantheon/
├── agents/                    # Конфигурации агентов
│   ├── tvashtar/              # Тваштар (программист)
│   │   ├── agent.yaml         # Модель, токен, скиллы, порт
│   │   └── CLAUDE.md          # Характер, роль, инструкции (system prompt)
│   └── _template/             # Шаблон для создания нового агента
│       ├── agent.yaml.example
│       └── CLAUDE.md
│
├── src/                       # Исходный код (TypeScript)
│   ├── index.ts               # Entry point
│   ├── bot.ts                 # Telegram message handler
│   ├── agent.ts               # Claude Code SDK wrapper
│   ├── config.ts              # Environment config
│   ├── agent-config.ts        # Agent YAML loader
│   ├── db.ts                  # SQLite (better-sqlite3)
│   ├── memory.ts              # Memory system
│   ├── memory-ingest.ts       # Memory extraction (async)
│   ├── memory-consolidate.ts  # Pattern consolidation
│   ├── embeddings.ts          # OpenAI embeddings (optional)
│   ├── orchestrator.ts        # Inter-agent delegation
│   ├── dashboard.ts           # Web monitoring UI (Hono)
│   ├── scheduler.ts           # Cron task runner
│   ├── voice.ts               # STT/TTS (Whisper/ElevenLabs)
│   ├── handoff.ts             # Session handoff snapshots
│   ├── env.ts                 # Secure .env parsing
│   ├── logger.ts              # Pino logging
│   ├── message-queue.ts       # Message serialization
│   ├── task-board.ts          # Board.md updates
│   └── *.test.ts              # Unit tests (Vitest)
│
├── skills/                    # Навыки агентов (Claude Code skills)
│   ├── minimax-pdf/           # Генерация PDF
│   ├── minimax-docx/          # Генерация Word
│   ├── minimax-xlsx/          # Генерация Excel
│   ├── pptx-generator/        # Генерация PowerPoint
│   ├── browser-use/           # Автоматизация браузера
│   ├── gmail/                 # Gmail API
│   ├── google-calendar/       # Google Calendar
│   ├── slack/                 # Slack
│   ├── timezone/              # Часовые пояса
│   └── tldr/                  # Суммаризация
│
├── scripts/                   # Утилиты
│   ├── setup.ts               # Интерактивный мастер настройки
│   ├── status.ts              # Проверка здоровья
│   ├── migrate.ts             # Миграции БД
│   ├── agent-create.sh        # Создание нового агента
│   ├── delegate-to-agent.sh   # Делегация задач
│   ├── send-as-agent.sh       # Отправка от имени агента
│   ├── board-update.sh        # Обновление доски задач
│   ├── backup.sh              # Бэкап данных
│   ├── install-launchd.sh     # Установка автозапуска (macOS)
│   └── notify.sh              # Уведомления
│
├── store/                     # Runtime данные (создаётся автоматически)
│   ├── claudeclaw.db          # SQLite база (память, сессии)
│   └── *.pid                  # Lock-файлы процессов
│
├── .claudeclaw/               # Конфиг координатора
│   ├── CLAUDE.md              # System prompt координатора
│   ├── settings.json          # Модель, таймзона, безопасность
│   └── skills-index.md        # Индекс всех скиллов
│
├── data/                      # Данные
│   └── board.md               # Доска задач (обновляется автоматически)
│
├── migrations/                # Версионирование схемы БД
│   └── version.json
│
├── launchd/                   # Шаблоны macOS автозапуска
├── logs/                      # Логи (создаётся автоматически)
├── output/                    # Сгенерированные файлы
├── dist/                      # Скомпилированный JS (после npm run build)
│
├── .env.example               # Шаблон переменных окружения
├── CLAUDE.md.example          # Шаблон system prompt координатора
├── package.json               # Зависимости и npm-скрипты
├── tsconfig.json              # TypeScript strict mode, ES2022
├── vitest.config.ts           # Конфигурация тестов
├── SECURITY.md                # Правила безопасности
├── CONTRIBUTING.md            # Как контрибьютить
└── CHANGELOG.md               # История изменений
```

---

## npm-скрипты

| Команда | Что делает |
|---------|-----------|
| `npm run build` | Компиляция TypeScript -> dist/ |
| `npm start` | Запуск главного бота (координатора) |
| `npm run agent:start tvashtar` | Запуск агента Тваштар |
| `npm run dev` | Dev-режим (без компиляции, через tsx) |
| `npm test` | Запуск тестов (Vitest) |
| `npm run setup` | Интерактивный мастер настройки |
| `npm run status` | Проверка здоровья системы |
| `npm run migrate` | Применить миграции БД |
| `npm run agent:create` | Создать нового агента (интерактивно) |

---

## Переменные окружения (.env)

### Обязательные (минимум для работы)

| Переменная | Описание | Пример |
|-----------|----------|--------|
| `TVASHTAR_BOT_TOKEN` | Токен Telegram бота от @BotFather | `123456789:ABC...xyz` |
| `ALLOWED_CHAT_ID` | Твой Telegram user ID | `213822023` |

### Опциональные (расширяют возможности)

| Переменная | Описание | Зачем |
|-----------|----------|-------|
| `ANTHROPIC_API_KEY` | API ключ Anthropic | Оплата по токенам (вместо Max подписки) |
| `OPENAI_API_KEY` | API ключ OpenAI | Векторная память (embeddings) |
| `GOOGLE_API_KEY` | Google AI Studio | Анализ видео, memory extraction |
| `GROQ_API_KEY` | Groq | Транскрипция голосовых (Whisper) |
| `ELEVENLABS_API_KEY` | ElevenLabs | Генерация голоса (TTS) |
| `DASHBOARD_TOKEN` | Токен доступа | Web-панель мониторинга |
| `DB_ENCRYPTION_KEY` | Ключ шифрования | Шифрование чувствительных полей в БД |

---

## Память и Hive Mind

Все агенты делят **одну SQLite базу** (`store/claudeclaw.db`).

### 3 слоя памяти

1. **Session memory** - контекст текущей сессии Claude Code (автоматически)
2. **Semantic memory** - извлечённые факты, решения, предпочтения (SQLite)
3. **Consolidations** - сжатые паттерны из массива воспоминаний (авто, каждые 4ч)

### Поиск в памяти

| Метод | Требует | Точность |
|-------|---------|----------|
| Vector search | OPENAI_API_KEY | Высокая (семантическая) |
| FTS5 keyword | Ничего | Средняя (по ключевым словам) |
| High-importance | Ничего | Базовая (последние важные) |

### Hive Mind (мультиагентность)

Каждый агент логирует свои действия:
```sql
INSERT INTO hive_mind (agent_id, chat_id, action, summary, created_at)
VALUES ('tvashtar', '123456', 'code_written', 'Написал API модуль auth', ...);
```

Другие агенты видят что было сделано - не нужно объяснять контекст заново.

---

## Персонализация

### Характер агента
Редактируй `agents/tvashtar/CLAUDE.md`:
- Стиль общения
- Любимые фразы
- Роль и специализация
- Правила безопасности

### Скиллы агента
Редактируй `agents/tvashtar/agent.yaml` - поле `skills`:
- Добавляй свои скиллы в `skills/` или `~/.claude/skills/`
- Убирай ненужные
- Скиллы из `~/.claude/skills/` доступны глобально

### Модель
В `agent.yaml` поле `model`:
- `claude-opus-4-6` - самая мощная, лучший код
- `claude-sonnet-4-20250514` - баланс скорость/качество
- `claude-haiku-4-5` - максимально быстрая и дешёвая

---

## Команды бота в Telegram

| Команда | Что делает |
|---------|-----------|
| `/start` | Начало работы, приветствие |
| `/newchat` | Сбросить сессию (с сохранением памяти) |
| `/chatid` | Показать твой Telegram ID |
| `/voice` | Включить/выключить голосовой режим |
| `/model opus\|sonnet\|haiku` | Сменить модель на лету |
| `/agents` | Список доступных агентов |
| `/delegate <agent> <task>` | Делегировать задачу другому агенту |
| `/dashboard` | Ссылка на web-панель |
| `/memory` | Статистика памяти |
| `/forget` | Очистить историю |

---

## Troubleshooting

### Бот не отвечает
1. Проверь что процесс запущен: `ps aux | grep "dist/index.js"`
2. Проверь логи: `cat logs/tvashtar.log` (если есть)
3. Проверь ALLOWED_CHAT_ID в .env совпадает с твоим ID
4. Проверь токен бота правильный: `curl https://api.telegram.org/bot<TOKEN>/getMe`

### Ошибка компиляции
```bash
rm -rf dist node_modules
npm install
npm run build
```

### Claude не авторизован
```bash
claude login
# Пройди авторизацию в браузере
```

### Контекст переполнен
Бот автоматически сбросит сессию при 80% заполнения. Или вручную: `/newchat`

### Память не работает
- Без OPENAI_API_KEY - только keyword search (нормально для начала)
- С OPENAI_API_KEY - полноценный векторный поиск

---

## Обновление

```bash
git pull
npm install
npm run build
# Перезапустить процесс
```

---

## FAQ

**Нужен ли API ключ Anthropic?**
Нет. Если у тебя Claude Max - используется подписка через `claude login`. API ключ нужен только для серверного деплоя или pay-per-token.

**Можно ли запустить без координатора?**
Да. `npm run agent:start tvashtar` запускает только Тваштара. Координатор (`npm start`) не нужен пока у тебя один агент.

**Что если я на Free плане Claude?**
Работать будет, но Opus (лучшее качество кода) доступен только на Max. На Free - Sonnet/Haiku.

**Работает на Windows?**
Через WSL2 - да. Нативно - нет.

**Как остановить?**
- В терминале: `Ctrl+C`
- Если через launchd: `launchctl stop com.claudeclaw.agent-tvashtar`
- Проверка: `npm run status`

**Сколько стоит?**
- Claude Max ($100/мес) - безлимит на Opus для 1 аккаунта
- Без Max: ~$15/1M input tokens, ~$75/1M output tokens (Opus)
- Память: OPENAI_API_KEY ~$0.02/1M tokens (почти бесплатно)

---

## Ссылки

- Telegram канал: [Дневник киборга](https://t.me/ai_jantrish)
- Основа: [ClaudeClaw](https://github.com/earlyaidopters/claudeclaw)

---

_"Тваштар, многообразный художник, знающий все ремёсла, создаёт и даёт жизнь формам." - Ригведа X.2.7_
