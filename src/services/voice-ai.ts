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
 * Process a voice transcription or text input through Claude.
 * Returns structured result: draft (with title/tags/body), save, or cancel.
 */
export async function processVoiceInput(
  input: string,
  session: VoiceSession | null
): Promise<VoiceAIResult> {
  const prompt = buildPrompt(input, session);

  for await (const msg of query({
    prompt,
    options: {
      model: config.ENRICHMENT_MODEL,
      maxTurns: 3,
      pathToClaudeCodeExecutable: CLAUDE_CODE_PATH,
    },
  })) {
    if (msg.type === 'result') {
      const response = msg.subtype === 'success' ? msg.result : null;
      logLLMExchange('VOICE AI', prompt, response);
      if (msg.subtype === 'success' && msg.result) {
        const jsonMatch = msg.result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in voice AI response');
        }
        const parsed = VoiceAIResultSchema.safeParse(JSON.parse(jsonMatch[0]));
        if (parsed.success) {
          return parsed.data;
        }
        throw new Error(`Voice AI response validation failed: ${parsed.error.message}`);
      }
      throw new Error(`Voice AI call failed: ${msg.subtype}`);
    }
  }

  throw new Error('No result from voice AI');
}
