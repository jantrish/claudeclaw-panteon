import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const EXTRACTION_MODEL = 'gpt-4.1-mini';

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
 * Generate text content via OpenAI GPT-4.1-mini with retry logic.
 * Returns raw text (expected to be JSON).
 * Retries up to 3 times with exponential backoff on transient errors.
 */
export async function generateContent(
  prompt: string,
  model = EXTRACTION_MODEL,
): Promise<string> {
  const env = readEnvFile(['OPENAI_API_KEY']);
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in .env');
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: prompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      // Non-retryable client errors (400, 401, 403, 404)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        const err = await response.text();
        logger.error({ status: response.status, err }, 'OpenAI extraction failed (non-retryable)');
        throw new Error(`OpenAI extraction failed: ${response.status}`);
      }

      // Retryable: 429 (rate limit), 5xx (server errors)
      if (!response.ok) {
        const err = await response.text();
        lastError = new Error(`OpenAI extraction failed: ${response.status}`);
        logger.warn(
          { status: response.status, attempt, err: err.slice(0, 200) },
          'OpenAI extraction failed (retrying)',
        );
        if (attempt < MAX_RETRIES) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1));
          continue;
        }
        throw lastError;
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      return data.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      // Network errors (ECONNRESET, timeout, etc.) — retryable
      if (err instanceof TypeError || (err instanceof Error && err.message.includes('fetch'))) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn({ attempt, err: lastError.message }, 'OpenAI fetch error (retrying)');
        if (attempt < MAX_RETRIES) {
          await sleep(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1));
          continue;
        }
      }
      throw err;
    }
  }

  throw lastError ?? new Error('OpenAI extraction failed after retries');
}

/**
 * Parse a JSON response, with fallback on malformed output.
 * Returns null if parsing fails.
 */
export function parseJsonResponse<T>(text: string): T | null {
  try {
    // Strip markdown code fences if present
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch (err) {
    logger.warn({ err, text: text.slice(0, 200) }, 'Failed to parse JSON response');
    return null;
  }
}
