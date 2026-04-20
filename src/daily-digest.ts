import { execFile } from 'child_process';
import { promisify } from 'util';

import { AGENT_ID, ALLOWED_CHAT_ID } from './config.js';
import { getConversationSince, saveStructuredMemory, saveMemoryEmbedding, logToHiveMind } from './db.js';
import { embedText } from './embeddings.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const DIGEST_PROMPT = `You are a daily digest agent. Given today's conversation turns between a user and their AI assistant, create a concise summary of the day.

Conversation turns (chronological):
{CONVERSATION}

Return a JSON object:
{
  "summary": "1-2 paragraph summary of what happened today",
  "topics": ["topic1", "topic2"],
  "decisions": ["decision 1", "decision 2"],
  "pendingTasks": ["unfinished task 1"],
  "entities": ["person/tool/project mentioned"]
}

Rules:
- Focus on WHAT was done, WHAT was decided, WHAT remains
- Be concise but complete
- topics: main themes discussed
- decisions: only actual decisions made
- pendingTasks: genuinely unfinished items
- entities: people, tools, projects, channels mentioned
- Write summary in Russian (the user's language)
- Return ONLY valid JSON, no markdown`;

interface DigestResult {
  summary: string;
  topics: string[];
  decisions: string[];
  pendingTasks: string[];
  entities: string[];
}

/**
 * Call Claude Sonnet via CLI for text generation.
 * Uses the existing Max subscription auth from ~/.claude/
 * No additional API costs.
 */
async function callSonnet(prompt: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('claude', [
      '-p', prompt,
      '--model', 'sonnet',
      '--no-session-persistence',
    ], {
      timeout: 120_000, // 2 min max
      maxBuffer: 1024 * 1024,
      env: { ...process.env },
    });
    return stdout.trim();
  } catch (err) {
    logger.error({ err }, 'Failed to call Sonnet via CLI');
    throw err;
  }
}

/**
 * Generate and save a daily digest.
 * Called once per day (e.g. at 23:00 local time).
 */
export async function runDailyDigest(chatId?: string): Promise<void> {
  const targetChat = chatId ?? ALLOWED_CHAT_ID;
  if (!targetChat) {
    logger.warn('No chat ID for daily digest');
    return;
  }

  logger.info('Starting daily digest generation');

  // Get last 24h of conversation
  const turns = getConversationSince(targetChat, 24);

  if (turns.length < 4) {
    logger.info({ turnCount: turns.length }, 'Not enough conversation for daily digest (need >= 4)');
    return;
  }

  // Format turns - truncate long messages to keep prompt manageable
  const formatted = turns.map((t) => {
    const content = t.content.length > 300 ? t.content.slice(0, 300) + '...' : t.content;
    return `[${t.role}]: ${content}`;
  }).join('\n\n');

  // Cap total prompt size (~8k chars max for conversation part)
  const truncatedConversation = formatted.length > 8000
    ? formatted.slice(-8000)
    : formatted;

  const prompt = DIGEST_PROMPT.replace('{CONVERSATION}', truncatedConversation);

  try {
    const raw = await callSonnet(prompt);

    // Parse JSON from response (handle possible markdown wrapping)
    let result: DigestResult;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      logger.warn({ raw: raw.slice(0, 200) }, 'Failed to parse daily digest JSON');
      return;
    }

    if (!result.summary) {
      logger.warn('Daily digest produced empty summary');
      return;
    }

    // Save as high-importance memory
    const today = new Date().toISOString().split('T')[0];
    const rawText = `Daily digest ${today}: ${result.summary}`;
    const memoryId = saveStructuredMemory(
      targetChat,
      rawText,
      `[Daily digest ${today}] ${result.summary}`,
      result.entities ?? [],
      result.topics ?? [],
      0.9, // high importance - daily summaries are valuable
      'daily_digest',
      'general',
      AGENT_ID,
    );

    // Generate embedding for the digest
    try {
      const embText = `${result.summary} ${(result.topics ?? []).join(' ')} ${(result.entities ?? []).join(' ')}`;
      const embedding = await embedText(embText);
      if (embedding.length > 0) {
        saveMemoryEmbedding(memoryId, embedding);
      }
    } catch (embErr) {
      logger.warn({ err: embErr }, 'Failed to embed daily digest');
    }

    // Log to Hive Mind for cross-agent visibility
    const topicsList = (result.topics ?? []).slice(0, 3).join(', ');
    logToHiveMind(
      AGENT_ID,
      targetChat,
      'daily_digest',
      `[${today}] Topics: ${topicsList}. Decisions: ${result.decisions?.length ?? 0}, Pending: ${result.pendingTasks?.length ?? 0}`,
    );

    logger.info(
      {
        date: today,
        topics: result.topics?.length ?? 0,
        decisions: result.decisions?.length ?? 0,
        pending: result.pendingTasks?.length ?? 0,
        memoryId,
      },
      'Daily digest saved',
    );
  } catch (err) {
    logger.error({ err }, 'Daily digest generation failed');
  }
}
