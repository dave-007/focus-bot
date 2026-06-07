/**
 * Telegram rate-limit safeguards.
 *
 * Telegram's documented limits:
 * - ~1 message per second per chat (sustained)
 * - 30 messages per second across all chats (global)
 * - Hitting either returns 429 with `parameters.retry_after` (seconds)
 *
 * Focus-bot does not currently stream token-by-token (low risk), but this utility
 * is installed defensively so any future hot-loop code can use it.
 *
 * See alpheus-bot incident 2026-05-22 — token-by-token editing locked it out
 * for 8 hours. Same root cause must be impossible here.
 *
 * Use `throttledCall()` to wrap ANY Telegram API call from a loop or timer.
 */
import type { Api } from 'grammy';
import { GrammyError } from 'grammy';

const MIN_INTERVAL_PER_CHAT_MS = 1100;
const GLOBAL_WINDOW_MS = 1000;
const GLOBAL_MAX_PER_WINDOW = 25;

const lastCallByChat = new Map<number | string, number>();
let globalWindow: number[] = [];

function now(): number {
  return Date.now();
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneGlobalWindow(): void {
  const cutoff = now() - GLOBAL_WINDOW_MS;
  globalWindow = globalWindow.filter((t) => t > cutoff);
}

async function acquireSlot(chatId: number | string): Promise<void> {
  const last = lastCallByChat.get(chatId) ?? 0;
  const sinceLast = now() - last;
  if (sinceLast < MIN_INTERVAL_PER_CHAT_MS) {
    await sleep(MIN_INTERVAL_PER_CHAT_MS - sinceLast);
  }

  pruneGlobalWindow();
  while (globalWindow.length >= GLOBAL_MAX_PER_WINDOW) {
    const oldest = globalWindow[0]!;
    const waitMs = (oldest + GLOBAL_WINDOW_MS) - now();
    await sleep(Math.max(waitMs, 50));
    pruneGlobalWindow();
  }

  lastCallByChat.set(chatId, now());
  globalWindow.push(now());
}

/**
 * Execute a Telegram API call with per-chat + global throttle and 429 honoring.
 *
 * - Waits before the call if recent traffic to this chat or globally is too high.
 * - On 429, parses `retry_after` and waits, then retries once.
 * - Caps wait at 60s — if Telegram demands longer, treat as structural problem.
 */
export async function throttledCall<T>(
  chatId: number | string,
  call: () => Promise<T>,
): Promise<T> {
  await acquireSlot(chatId);
  try {
    return await call();
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 429) {
      const retryAfter = (err.parameters as { retry_after?: number } | undefined)?.retry_after ?? 5;
      const waitMs = Math.min(retryAfter * 1000, 60_000);
      console.warn(`[rate-limit] 429 for chat ${chatId}, waiting ${waitMs}ms (retry_after=${retryAfter}s)`);
      if (retryAfter * 1000 > 60_000) {
        console.error(`[rate-limit] retry_after ${retryAfter}s exceeds 60s cap — giving up. Investigate caller.`);
        throw err;
      }
      await sleep(waitMs);
      await acquireSlot(chatId);
      return await call();
    }
    throw err;
  }
}

export async function throttledEditMessageText(
  api: Api,
  chatId: number,
  messageId: number,
  text: string,
  other?: Parameters<Api['editMessageText']>[3],
): Promise<ReturnType<Api['editMessageText']>> {
  return throttledCall(chatId, () => api.editMessageText(chatId, messageId, text, other));
}

export async function throttledSendMessage(
  api: Api,
  chatId: number,
  text: string,
  other?: Parameters<Api['sendMessage']>[2],
): Promise<ReturnType<Api['sendMessage']>> {
  return throttledCall(chatId, () => api.sendMessage(chatId, text, other));
}
