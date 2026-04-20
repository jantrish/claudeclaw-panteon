import fs from 'fs';
import path from 'path';

import { AGENT_ID, STORE_DIR } from './config.js';
import { getRecentConversation } from './db.js';
import { generateContent, parseJsonResponse } from './extraction.js';
import { logger } from './logger.js';

/** Each agent gets its own handoff file to avoid race conditions. */
const HANDOFF_FILE = path.join(STORE_DIR, `handoff-${AGENT_ID}.json`);

interface HandoffSnapshot {
  /** When the snapshot was created */
  created_at: string;
  /** What was being discussed */
  currentTopic: string;
  /** Key decisions made during the session */
  decisions: string[];
  /** Unfinished tasks or open questions */
  pendingTasks: string[];
  /** Important context that shouldn't be lost */
  criticalContext: string;
  /** Trigger: 'compaction' | 'newchat' | 'manual' */
  trigger: string;
}

const HANDOFF_PROMPT = `You are a session handoff agent. Given recent conversation turns between a user and their AI assistant, create a snapshot of the current state.

Your job is to capture what matters for continuity — so the next session can pick up seamlessly.

Conversation turns (most recent last):
{CONVERSATION}

Return JSON:
{
  "currentTopic": "What was being discussed/worked on (1 sentence)",
  "decisions": ["Decision 1", "Decision 2"],
  "pendingTasks": ["Unfinished task 1", "Open question 1"],
  "criticalContext": "Any important context that would be lost (1-2 sentences)"
}

Rules:
- Be concise. Each field should be brief and actionable.
- decisions: only include actual decisions made, not just topics discussed
- pendingTasks: only include things that are genuinely unfinished
- If nothing notable, return minimal/empty arrays`;

/**
 * Generate a handoff snapshot from recent conversation and save to disk.
 * Called before /newchat or when compaction is detected.
 */
export async function createHandoffSnapshot(
  chatId: string,
  trigger: 'compaction' | 'newchat' | 'manual',
): Promise<HandoffSnapshot | null> {
  try {
    const turns = getRecentConversation(chatId, 20);
    if (turns.length < 2) {
      logger.debug('Not enough conversation turns for handoff snapshot');
      return null;
    }

    // Format turns for the prompt (chronological order)
    const formatted = [...turns].reverse().map((t) => {
      const content = t.content.slice(0, 500);
      return `[${t.role}]: ${content}`;
    }).join('\n\n');

    const prompt = HANDOFF_PROMPT.replace('{CONVERSATION}', formatted);
    const raw = await generateContent(prompt);
    const result = parseJsonResponse<Omit<HandoffSnapshot, 'created_at' | 'trigger'>>(raw);

    if (!result || !result.currentTopic) {
      logger.warn('Handoff snapshot generation produced invalid result');
      return null;
    }

    const snapshot: HandoffSnapshot = {
      created_at: new Date().toISOString(),
      currentTopic: result.currentTopic,
      decisions: result.decisions ?? [],
      pendingTasks: result.pendingTasks ?? [],
      criticalContext: result.criticalContext ?? '',
      trigger,
    };

    // Save to disk
    fs.writeFileSync(HANDOFF_FILE, JSON.stringify(snapshot, null, 2), 'utf-8');
    logger.info({ trigger, topic: snapshot.currentTopic.slice(0, 60) }, 'Handoff snapshot saved');

    return snapshot;
  } catch (err) {
    logger.error({ err }, 'Failed to create handoff snapshot');
    return null;
  }
}

/**
 * Load the latest handoff snapshot from disk.
 * Returns null if no snapshot exists or it's older than 24 hours.
 */
export function loadHandoffSnapshot(): HandoffSnapshot | null {
  try {
    if (!fs.existsSync(HANDOFF_FILE)) return null;

    const raw = fs.readFileSync(HANDOFF_FILE, 'utf-8');
    const snapshot = JSON.parse(raw) as HandoffSnapshot;

    // Expire snapshots older than 24 hours
    const age = Date.now() - new Date(snapshot.created_at).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      logger.debug('Handoff snapshot expired (>24h)');
      return null;
    }

    return snapshot;
  } catch {
    return null;
  }
}

/**
 * Delete the handoff snapshot file after it has been consumed.
 * Ensures handoff context is injected exactly once.
 */
export function consumeHandoffSnapshot(): void {
  try {
    if (fs.existsSync(HANDOFF_FILE)) {
      fs.unlinkSync(HANDOFF_FILE);
      logger.debug('Handoff snapshot consumed and deleted');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to delete consumed handoff snapshot');
  }
}

/**
 * Format a handoff snapshot as context string for injection into the prompt.
 */
export function formatHandoffContext(snapshot: HandoffSnapshot): string {
  const lines: string[] = ['[Handoff from previous session]'];

  lines.push(`Topic: ${snapshot.currentTopic}`);

  if (snapshot.decisions.length > 0) {
    lines.push('Decisions made:');
    for (const d of snapshot.decisions) {
      lines.push(`- ${d}`);
    }
  }

  if (snapshot.pendingTasks.length > 0) {
    lines.push('Pending/unfinished:');
    for (const t of snapshot.pendingTasks) {
      lines.push(`- ${t}`);
    }
  }

  if (snapshot.criticalContext) {
    lines.push(`Context: ${snapshot.criticalContext}`);
  }

  lines.push('[End handoff]');
  return lines.join('\n');
}
