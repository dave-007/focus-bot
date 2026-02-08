import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { config } from '../config.js';
import type { VoiceSession, ConversationTurn } from './voice-session.js';

const CLAUDE_CODE_PATH =
  process.env.CLAUDE_CODE_PATH || 'claude';

const SYSTEM_PROMPT = `You are a voice note assistant for an Obsidian vault. The user dictates notes via voice messages (transcribed to text). Your job is to maintain a structured note with a title, tags, and body.

Rules:
- Clean up ALL filler words (um, uh, like, you know), repeated phrases, false starts, and verbal artifacts. Output standard written prose, not a voice transcription.
- If the user's message starts with an instruction prefix like "take a new note", "new note", "capture this", etc., strip the prefix and use only the content portion.
- title: 1-100 characters, concise and descriptive, suitable as a filename
- tags: 1-8 tags describing the TYPE of capture (not the topic). Always plural. Examples: ideas, quotes, articles, reflections, observations, recipes, poems, tools. Do NOT include "captures" — it is added automatically. Do NOT use tags for subject matter — wiki-links in the body handle that.
- body: Insert [[wiki-links]] around key concepts, important nouns, and proper names. Only link the FIRST occurrence of each term. Preserve the user's meaning exactly — only add [[ and ]] around terms worth linking.
- When the user gives editing instructions (continue, replace, remove, change, add, etc.), interpret them and return the COMPLETE updated note.
- When the user says to save, finish, or is done, return a save action.
- When the user says to cancel, discard, or never mind, return a cancel action.

Respond with ONLY a JSON object (no markdown, no explanation) in one of these formats:
{"action": "draft", "title": "Note Title", "tags": ["ideas"], "body": "Clean prose with [[wiki-links]]..."}
{"action": "save"}
{"action": "cancel"}`;

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
  const parts: string[] = [SYSTEM_PROMPT];

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
      maxTurns: 1,
      pathToClaudeCodeExecutable: CLAUDE_CODE_PATH,
    },
  })) {
    if (msg.type === 'result') {
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
