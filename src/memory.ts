import { AGENT_ID, agentObsidianConfig } from './config.js';
import {
  decayMemories,
  getRecentConsolidations,
  getRecentHighImportanceMemories,
  logConversationTurn,
  pruneConversationLog,
  pruneSlackMessages,
  pruneWaMessages,
  searchConsolidations,
  searchMemories,
  touchMemory,
} from './db.js';
import { embedText } from './embeddings.js';
import { loadHandoffSnapshot, formatHandoffContext, consumeHandoffSnapshot } from './handoff.js';
import { logger } from './logger.js';
import { ingestConversationTurn } from './memory-ingest.js';
import { buildObsidianContext } from './obsidian.js';

/**
 * Build a structured memory context string to prepend to the user's message.
 *
 * Three-layer retrieval:
 *   Layer 1: FTS5 keyword search on summary + raw_text + entities + topics (top 5)
 *   Layer 2: Recent high-importance memories (importance >= 0.5, top 5 by accessed_at)
 *   Layer 3: Relevant consolidation insights
 *
 * Deduplicates across layers. Returns formatted context with structure.
 */
export async function buildMemoryContext(
  chatId: string,
  userMessage: string,
): Promise<string> {
  const seen = new Set<number>();
  const memLines: string[] = [];

  // Embed the query for vector search (async, adds ~200ms but gives semantic results)
  let queryEmbedding: number[] | undefined;
  try {
    queryEmbedding = await embedText(userMessage);
  } catch {
    // Embedding failure is non-fatal; falls back to keyword search
  }

  // Layer 1: semantic search (embedding) with FTS5/LIKE fallback
  const searched = searchMemories(chatId, userMessage, 5, queryEmbedding, AGENT_ID);
  for (const mem of searched) {
    seen.add(mem.id);
    touchMemory(mem.id);
    memLines.push(formatMemoryLine(mem));
  }

  // Layer 2: recent high-importance memories (deduplicated)
  const recent = getRecentHighImportanceMemories(chatId, 5);
  for (const mem of recent) {
    if (seen.has(mem.id)) continue;
    seen.add(mem.id);
    touchMemory(mem.id);
    memLines.push(formatMemoryLine(mem));
  }

  // Layer 3: consolidation insights
  const insightLines: string[] = [];
  const consolidations = searchConsolidations(chatId, userMessage, 2);
  if (consolidations.length === 0) {
    // Fall back to most recent consolidations
    const recentInsights = getRecentConsolidations(chatId, 2);
    for (const c of recentInsights) {
      insightLines.push(`- ${c.insight}`);
    }
  } else {
    for (const c of consolidations) {
      insightLines.push(`- ${c.insight}`);
    }
  }

  // Layer 0: Handoff snapshot from previous session (one-time injection)
  const handoff = loadHandoffSnapshot();
  let handoffBlock = '';
  if (handoff) {
    handoffBlock = formatHandoffContext(handoff);
    consumeHandoffSnapshot();
    logger.info('Handoff snapshot injected into memory context');
  }

  if (memLines.length === 0 && insightLines.length === 0 && !agentObsidianConfig && !handoffBlock) {
    return '';
  }

  const parts: string[] = [];

  // Handoff goes first — most important context for session continuity
  if (handoffBlock) {
    parts.push(handoffBlock);
  }

  if (memLines.length > 0 || insightLines.length > 0) {
    const blocks: string[] = ['[Memory context]'];
    if (memLines.length > 0) {
      blocks.push('Relevant memories:');
      blocks.push(...memLines);
    }
    if (insightLines.length > 0) {
      blocks.push('');
      blocks.push('Insights:');
      blocks.push(...insightLines);
    }
    blocks.push('[End memory context]');
    parts.push(blocks.join('\n'));
  }

  const obsidianBlock = buildObsidianContext(agentObsidianConfig);
  if (obsidianBlock) parts.push(obsidianBlock);

  return parts.join('\n\n');
}

/**
 * Process a conversation turn: log it and fire async memory extraction.
 * Called AFTER Claude responds, with both user message and Claude's response.
 *
 * The conversation log is written synchronously (for /respin support).
 * Memory extraction via Gemini is fire-and-forget (never blocks the response).
 */
export function saveConversationTurn(
  chatId: string,
  userMessage: string,
  claudeResponse: string,
  sessionId?: string,
  agentId = 'main',
): void {
  try {
    // Always log full conversation to conversation_log (for /respin)
    logConversationTurn(chatId, 'user', userMessage, sessionId, agentId);
    logConversationTurn(chatId, 'assistant', claudeResponse, sessionId, agentId);
  } catch (err) {
    logger.error({ err }, 'Failed to log conversation turn');
  }

  // Fire-and-forget: LLM-powered memory extraction via OpenAI GPT-4.1-mini
  // This runs async and never blocks the user's response
  void ingestConversationTurn(chatId, userMessage, claudeResponse).catch((err) => {
    logger.error({ err }, 'Memory ingestion fire-and-forget failed');
  });
}

/**
 * Run the daily decay sweep. Call once on startup and every 24h.
 * Also prunes old conversation_log entries to prevent unbounded growth.
 *
 * MESSAGE RETENTION POLICY:
 * WhatsApp and Slack messages are auto-deleted after 3 days.
 * This is a security measure: message bodies contain personal
 * conversations that must not persist on disk indefinitely.
 */
export function runDecaySweep(): void {
  decayMemories();
  pruneConversationLog(500);

  // Enforce 3-day retention on messaging data
  const wa = pruneWaMessages(3);
  const slack = pruneSlackMessages(3);
  if (wa.messages + wa.outbox + wa.map + slack > 0) {
    logger.info(
      { wa_messages: wa.messages, wa_outbox: wa.outbox, wa_map: wa.map, slack },
      'Retention pruning complete',
    );
  }
}

/** Type labels for memory context display */
const TYPE_LABELS: Record<string, string> = {
  fact: 'fact',
  decision: 'decision',
  event: 'event',
};

/** Format a single memory line with type label and topics */
function formatMemoryLine(mem: { importance: number; summary: string; topics: string; memory_type?: string }): string {
  const topics = safeParse(mem.topics);
  const topicStr = topics.length > 0 ? ` (${topics.join(', ')})` : '';
  const typeLabel = TYPE_LABELS[mem.memory_type ?? ''];
  const typeStr = typeLabel ? ` [${typeLabel}]` : '';
  return `- [${mem.importance.toFixed(1)}]${typeStr} ${mem.summary}${topicStr}`;
}

/** Safely parse a JSON array string, returning [] on failure. */
function safeParse(json: string): string[] {
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}
