import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;

/** Max retry attempts for OpenAI API calls. */
const MAX_RETRIES = 3;
/** Initial backoff delay in ms (doubles each retry). */
const INITIAL_BACKOFF_MS = 1000;

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate an embedding vector using OpenAI text-embedding-3-small.
 * Returns a float array (1536 dimensions).
 * Retries up to 3 times with exponential backoff on transient errors.
 */
export async function embedText(text: string): Promise<number[]> {
  const env = readEnvFile(['OPENAI_API_KEY']);
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in .env');
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text,
          dimensions: EMBEDDING_DIMS,
        }),
      });

      // Non-retryable client errors (400, 401, 403, 404)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const err = await response.text();
        logger.error({ status: response.status, err }, 'OpenAI embedding failed (non-retryable)');
        throw new Error(`OpenAI embedding failed: ${response.status}`);
      }

      // Retryable: 429 (rate limit), 5xx (server errors)
      if (!response.ok) {
        const err = await response.text();
        lastError = new Error(`OpenAI embedding failed: ${response.status}`);
        logger.warn(
          { status: response.status, attempt, err: err.slice(0, 200) },
          'OpenAI embedding failed (retrying)',
        );
        if (attempt < MAX_RETRIES) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1));
          continue;
        }
        throw lastError;
      }

      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      return data.data?.[0]?.embedding ?? [];
    } catch (err) {
      // Network errors (ECONNRESET, timeout, etc.) — retryable
      if (err instanceof TypeError || (err instanceof Error && err.message.includes('fetch'))) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn({ attempt, err: lastError.message }, 'OpenAI embedding fetch error (retrying)');
        if (attempt < MAX_RETRIES) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1));
          continue;
        }
      }
      throw err;
    }
  }

  throw lastError ?? new Error('OpenAI embedding failed after retries');
}

/**
 * Cosine similarity between two vectors. Returns -1 to 1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;
  return dot / denom;
}
