import fs from 'fs';
import path from 'path';

import { loadAgentConfig, resolveAgentDir, resolveAgentClaudeMd } from './agent-config.js';
import { createBot } from './bot.js';
import { checkPendingMigrations } from './migrations.js';
import { ALLOWED_CHAT_ID, activeBotToken, STORE_DIR, PROJECT_ROOT, CLAUDECLAW_CONFIG, setAgentOverrides } from './config.js';
import { logToHiveMind } from './db.js';
import { readEnvFile } from './env.js';
import { startDashboard } from './dashboard.js';
import { initDatabase } from './db.js';
import { logger } from './logger.js';
import { cleanupOldUploads } from './media.js';
import { runDailyDigest } from './daily-digest.js';
import { runConsolidation } from './memory-consolidate.js';
import { runDecaySweep } from './memory.js';
import { initOrchestrator, checkAndRunChains } from './orchestrator.js';
import { initScheduler } from './scheduler.js';
import { setTelegramConnected, setBotInfo } from './state.js';

// Parse --agent flag
const agentFlagIndex = process.argv.indexOf('--agent');
const AGENT_ID = agentFlagIndex !== -1 ? process.argv[agentFlagIndex + 1] : 'main';

// Export AGENT_ID to env so child processes (schedule-cli, etc.) inherit it
process.env.CLAUDECLAW_AGENT_ID = AGENT_ID;

if (AGENT_ID !== 'main') {
  const agentConfig = loadAgentConfig(AGENT_ID);
  const agentDir = resolveAgentDir(AGENT_ID);
  const claudeMdPath = resolveAgentClaudeMd(AGENT_ID);
  let systemPrompt: string | undefined;
  if (claudeMdPath) {
    try {
      systemPrompt = fs.readFileSync(claudeMdPath, 'utf-8');
    } catch { /* no CLAUDE.md */ }
  }
  setAgentOverrides({
    agentId: AGENT_ID,
    botToken: agentConfig.botToken,
    cwd: agentDir,
    model: agentConfig.model,
    obsidian: agentConfig.obsidian,
    systemPrompt,
  });
  logger.info({ agentId: AGENT_ID, name: agentConfig.name }, 'Running as agent');
} else {
  // For main bot: read CLAUDE.md from CLAUDECLAW_CONFIG and inject it as
  // systemPrompt — the same pattern used by sub-agents. Never copy the file
  // into the repo; that defeats the purpose of CLAUDECLAW_CONFIG and risks
  // accidentally committing personal config.
  const externalClaudeMd = path.join(CLAUDECLAW_CONFIG, 'CLAUDE.md');
  if (fs.existsSync(externalClaudeMd)) {
    let systemPrompt: string | undefined;
    try {
      systemPrompt = fs.readFileSync(externalClaudeMd, 'utf-8');
    } catch { /* unreadable */ }
    if (systemPrompt) {
      setAgentOverrides({
        agentId: 'main',
        botToken: activeBotToken,
        cwd: PROJECT_ROOT,
        systemPrompt,
      });
      logger.info({ source: externalClaudeMd }, 'Loaded CLAUDE.md from CLAUDECLAW_CONFIG');
    }
  } else if (!fs.existsSync(path.join(PROJECT_ROOT, 'CLAUDE.md'))) {
    logger.warn(
      'No CLAUDE.md found. Copy CLAUDE.md.example to %s/CLAUDE.md and customize it.',
      CLAUDECLAW_CONFIG,
    );
  }
}

const PID_FILE = path.join(STORE_DIR, `${AGENT_ID === 'main' ? 'claudeclaw' : `agent-${AGENT_ID}`}.pid`);

function showBanner(): void {
  const bannerPath = path.join(PROJECT_ROOT, 'banner.txt');
  try {
    const banner = fs.readFileSync(bannerPath, 'utf-8');
    console.log('\n' + banner);
  } catch {
    console.log('\n  ClaudeClaw\n');
  }
}

function acquireLock(): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  try {
    if (fs.existsSync(PID_FILE)) {
      const old = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (!isNaN(old) && old !== process.pid) {
        try {
          process.kill(old, 'SIGTERM');
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
        } catch { /* already dead */ }
      }
    }
  } catch { /* ignore */ }
  fs.writeFileSync(PID_FILE, String(process.pid));
}

function releaseLock(): void {
  try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
}

async function main(): Promise<void> {
  
  checkPendingMigrations(PROJECT_ROOT);

  if (AGENT_ID === 'main') {
    showBanner();
  }

  if (!activeBotToken) {
    if (AGENT_ID === 'main') {
      logger.error('Bot token is not set. Run npm run setup to configure it.');
    } else {
      logger.error({ agentId: AGENT_ID }, `Configuration for agent "${AGENT_ID}" is broken: bot token not set. Check .env or re-run npm run agent:create.`);
    }
    process.exit(1);
  }

  acquireLock();

  initDatabase();
  logger.info('Database ready');

  // Validate API keys — warn early if memory features won't work
  const envKeys = readEnvFile(['OPENAI_API_KEY']);
  if (!envKeys.OPENAI_API_KEY) {
    logger.warn(
      '⚠️  OPENAI_API_KEY не найден в .env — память (извлечение, embeddings, консолидация, handoff) работать не будет',
    );
  }

  initOrchestrator();

  runDecaySweep();
  setInterval(() => runDecaySweep(), 24 * 60 * 60 * 1000);

  // Memory consolidation: find patterns across recent memories every 4 hours
  // Only main agent runs consolidation — sub-agents skip to avoid duplicate work
  const hasOpenAIKey = !!readEnvFile(['OPENAI_API_KEY']).OPENAI_API_KEY;
  if (ALLOWED_CHAT_ID && hasOpenAIKey && AGENT_ID === 'main') {
    // Delay first consolidation 10 minutes after startup to let things settle
    setTimeout(() => {
      void runConsolidation(ALLOWED_CHAT_ID).catch((err) =>
        logger.error({ err }, 'Initial consolidation failed'),
      );
    }, 10 * 60 * 1000);
    setInterval(() => {
      void runConsolidation(ALLOWED_CHAT_ID).catch((err) =>
        logger.error({ err }, 'Periodic consolidation failed'),
      );
    }, 4 * 60 * 60 * 1000);
    logger.info('Memory consolidation enabled (every 4 hours)');
  }

  // Daily digest: summarize the day's conversation at configured time
  // Only main agent runs daily digest — sub-agents skip
  if (ALLOWED_CHAT_ID && AGENT_ID === 'main') {
    const scheduleDigest = () => {
      const now = new Date();
      // Target: 23:00 GMT+4 = 19:00 UTC
      const target = new Date(now);
      target.setUTCHours(19, 0, 0, 0);
      // If already past 19:00 UTC today, schedule for tomorrow
      if (now >= target) {
        target.setDate(target.getDate() + 1);
      }
      const delay = target.getTime() - now.getTime();
      logger.info({ nextRun: target.toISOString(), delayMs: delay }, 'Daily digest scheduled');
      setTimeout(() => {
        void runDailyDigest().catch((err) =>
          logger.error({ err }, 'Daily digest failed'),
        );
        // Reschedule for next day
        scheduleDigest();
      }, delay);
    };
    scheduleDigest();
  }

  cleanupOldUploads();

  const bot = createBot();

  // Dashboard runs in every agent process (each on its own port)
  if (AGENT_ID === 'main') {
    startDashboard(bot.api);
  } else {
    const agentCfg = loadAgentConfig(AGENT_ID);
    if (agentCfg.dashboardPort) {
      startDashboard(bot.api, agentCfg.dashboardPort);
    }
  }

  if (ALLOWED_CHAT_ID) {
    initScheduler(
      (text) => bot.api.sendMessage(ALLOWED_CHAT_ID, text, { parse_mode: 'HTML' }).then(() => {}).catch((err) => logger.error({ err }, 'Scheduler failed to send message')),
      AGENT_ID,
    );
  } else {
    logger.warn('ALLOWED_CHAT_ID not set — scheduler disabled (no destination for results)');
  }

  // Cross-agent chain scheduler — only main agent checks chains
  if (ALLOWED_CHAT_ID && AGENT_ID === 'main') {
    setInterval(() => checkAndRunChains(ALLOWED_CHAT_ID), 60_000);
    logger.info('Chain scheduler enabled (checking every 60s)');
  }

  const shutdown = async () => {
    logger.info('Shutting down...');
    setTelegramConnected(false);
    releaseLock();
    // Timeout: if bot.stop() hangs (e.g. stuck long-polling), force exit after 5s
    const forceExit = setTimeout(() => {
      logger.warn('Forced shutdown after 5s timeout');
      process.exit(1);
    }, 5000);
    try {
      await bot.stop();
    } catch {
      // Ignore stop errors during shutdown
    }
    clearTimeout(forceExit);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  logger.info({ agentId: AGENT_ID }, 'Starting ClaudeClaw...');

  await bot.start({
    onStart: (botInfo) => {
      setTelegramConnected(true);
      setBotInfo(botInfo.username ?? '', botInfo.first_name ?? 'ClaudeClaw');
      logger.info({ username: botInfo.username }, 'ClaudeClaw is running');

      // Log startup to Hive Mind
      if (ALLOWED_CHAT_ID) {
        logToHiveMind(AGENT_ID, ALLOWED_CHAT_ID, 'startup', `Bot started @${botInfo.username}`);
      }
      if (AGENT_ID === 'main') {
        console.log(`\n  ClaudeClaw online: @${botInfo.username}`);
        if (!ALLOWED_CHAT_ID) {
          console.log(`  Send /chatid to get your chat ID for ALLOWED_CHAT_ID`);
        }
        console.log();
      } else {
        console.log(`\n  ClaudeClaw agent [${AGENT_ID}] online: @${botInfo.username}\n`);
      }
    },
  });
}

main().catch((err: unknown) => {
  logger.error({ err }, 'Fatal error');
  releaseLock();
  process.exit(1);
});
