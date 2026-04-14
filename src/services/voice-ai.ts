import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { config } from '../config.js';
import { getPrompt } from './prompts.js';
import { logLLMExchange } from '../utils/transcript-log.js';
import type { VoiceSession, ConversationTurn } from './voice-session.js';

const CLAUDE_CODE_PATH = process.env.CLAUDE_CODE_PATH || 'claude';

const DraftResultSchema = z.object({
  action: z.literal('draft'),
  title: z.string().min(1).max(100),
  tags: z.array(z.string()).min(1).max(8),
  body: z.string().min(1),
});

const SaveResultSchema = z.object({
  action: z.literal('save'),
});

const CancelResultSchema = z.object({
  action: z.literal('cancel'),
});

const VoiceAIResultSchema = z.discriminatedUnion('action', [
  DraftResultSchema,
  SaveResultSchema,
  CancelResultSchema,
]);

export type VoiceAIResult = z.infer<typeof VoiceAIResultSchema>;

/**
 * Build the full prompt with system instructions, conversation history, and new input.
 */
function buildPrompt(input: string, session: VoiceSession | null): string {
  const parts: string[] = [getPrompt('voice-assistant')];

  if (session) {
    // Include conversation history for multi-turn context
    parts.push('\n--- Conversation so far ---');
    for (const turn of session.conversationHistory) {
      const label = turn.role === 'user' ? 'User' : 'Assistant';
      parts.push(`${label}: ${turn.content}`);
    }
    parts.push('--- End conversation ---');

    // Include current note state for clarity
    parts.push(`\nCurrent note state:
Title: ${session.title}
Tags: ${session.tags.join(', ')}
Body:
${session.draft}`);
  }

  parts.push(`\nNew user input:\n${input}`);

  return parts.join('\n');
}

/**
 * Extract and validate JSON from a voice AI response string.
 * Returns the parsed result or null if extraction fails.
 */
function extractResult(response: string): VoiceAIResult | null {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = VoiceAIResultSchema.safeParse(JSON.parse(jsonMatch[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Call the voice AI and return the raw response string.
 */
async function callVoiceAI(prompt: string): Promise<string | null> {
  for await (const msg of query({
    prompt,
    options: {
      model: config.ENRICHMENT_MODEL,
      maxTurns: 2,
      tools: [],
      pathToClaudeCodeExecutable: CLAUDE_CODE_PATH,
    },
  })) {
    if (msg.type === 'result') {
      logLLMExchange('VOICE AI', prompt, msg.subtype === 'success' ? msg.result : null);
      if (msg.subtype === 'success' && msg.result) {
        return msg.result;
      }
      console.warn(`[voice-ai] Call failed: ${msg.subtype}`);
      return null;
    }
  }
  return null;
}

/**
 * Process a voice transcription or text input through Claude.
 * Returns structured result: draft (with title/tags/body), save, or cancel.
 * Retries once if JSON extraction fails, then falls back to a raw draft.
 */
export async function processVoiceInput(
  input: string,
  session: VoiceSession | null
): Promise<VoiceAIResult> {
  const prompt = buildPrompt(input, session);
  const response = await callVoiceAI(prompt);

  // First attempt to extract JSON
  if (response) {
    const result = extractResult(response);
    if (result) return result;
  }

  // Retry once with explicit JSON reminder
  console.warn('[voice-ai] No valid JSON in response, retrying...');
  const retryPrompt = prompt + '\n\nIMPORTANT: You MUST respond with valid JSON only. No other text.';
  const retryResponse = await callVoiceAI(retryPrompt);
  if (retryResponse) {
    const retryResult = extractResult(retryResponse);
    if (retryResult) return retryResult;
  }

  // Fallback: create a draft from the raw input so the user's content isn't lost
  console.warn('[voice-ai] Retry failed, falling back to raw draft');
  return {
    action: 'draft',
    title: input.slice(0, 60).replace(/[^\w\s]/g, '').trim() || 'Voice Note',
    tags: ['captures'],
    body: input,
  };
}
