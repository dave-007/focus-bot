import { Context } from 'grammy';
import {
  captureNote,
  parsePrefixes,
  formatLocalDatetime,
  type CaptureOptions,
  type ForwardInfo,
} from '../../services/note-capture.js';
import { processNote } from '../../services/note-enrichment.js';
import { hasSession } from '../../services/voice-session.js';
import { processVoiceSessionInput } from './voice.js';

const MERGE_WINDOW_MS = 30_000;

interface BufferedMessage {
  texts: string[];
  ctx: Context;
  chatId: number;
  timer: ReturnType<typeof setTimeout>;
  explicitTags: string[];
  statusOverride: string | null;
  typeTag: string | null;
  targetFolder: string | null;
  forwardInfo: ForwardInfo | undefined;
}

const messageBuffer = new Map<number, BufferedMessage>();

/**
 * Extract forwarding metadata from a Telegram message.
 */
export function extractForwardInfo(message: Context['message']): ForwardInfo | undefined {
  const origin = message?.forward_origin;
  if (!origin) return undefined;

  const originalDate = formatLocalDatetime(new Date(origin.date * 1000));

  switch (origin.type) {
    case 'channel':
      return {
        from: origin.chat.title ?? null,
        author: origin.author_signature ?? null,
        originalDate,
      };
    case 'chat':
      return {
        from: origin.sender_chat.title ?? null,
        author: origin.author_signature ?? null,
        originalDate,
      };
    case 'user':
      return {
        from: [origin.sender_user.first_name, origin.sender_user.last_name].filter(Boolean).join(' '),
        author: origin.sender_user.username ?? null,
        originalDate,
      };
    case 'hidden_user':
      return {
        from: origin.sender_user_name,
        author: null,
        originalDate,
      };
    default:
      return undefined;
  }
}

/**
 * Flush the message buffer for a user: merge texts and capture as a single note.
 */
export async function flushBuffer(userId: number): Promise<void> {
  const buffer = messageBuffer.get(userId);
  if (!buffer) return;
  messageBuffer.delete(userId);

  const mergedText = buffer.texts.join('\n\n');
  const options: CaptureOptions = {};
  if (buffer.explicitTags.length > 0) options.explicitTags = buffer.explicitTags;
  if (buffer.statusOverride) options.statusOverride = buffer.statusOverride;
  if (buffer.typeTag) options.typeTag = buffer.typeTag;
  if (buffer.targetFolder) options.targetFolder = buffer.targetFolder;
  if (buffer.forwardInfo) options.forwardInfo = buffer.forwardInfo;

  try {
    const result = await captureNote(mergedText, options);
    await buffer.ctx.react('👍');

    const messageId = buffer.ctx.message?.message_id;
    processNote(result.filePath, result.urls, messageId ? {
      chatId: buffer.chatId,
      messageId,
      api: buffer.ctx.api,
    } : undefined).catch((error) => {
      console.error('[enrichment] Failed:', error);
    });
  } catch (error) {
    console.error('Note capture failed:', error);
    await buffer.ctx.reply('Failed to save note. Please try again.');
  }
}

export async function handleTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  const userId = ctx.from?.id;
  if (!text || !ctx.chat || !userId) return;

  // If user has an active voice drafting session, route text there
  if (hasSession(userId)) {
    try {
      await ctx.api.sendChatAction(ctx.chat.id, 'typing');
      await processVoiceSessionInput(ctx, userId, ctx.chat.id, text);
    } catch (error) {
      console.error('[voice] Text input to session failed:', error);
      await ctx.reply('Failed to process edit. Please try again.');
    }
    return;
  }

  await ctx.api.sendChatAction(ctx.chat.id, 'typing');

  // Parse prefixes and extract forward info
  const parsed = parsePrefixes(text);
  const forwardInfo = extractForwardInfo(ctx.message);

  const existing = messageBuffer.get(userId);
  if (existing) {
    // Append to existing buffer, accumulate tags, reset timer
    existing.texts.push(parsed.cleanText);
    existing.ctx = ctx;
    for (const tag of parsed.explicitTags) {
      if (!existing.explicitTags.includes(tag)) existing.explicitTags.push(tag);
    }
    clearTimeout(existing.timer);
    existing.timer = setTimeout(() => flushBuffer(userId), MERGE_WINDOW_MS);
  } else {
    // Start new buffer
    const timer = setTimeout(() => flushBuffer(userId), MERGE_WINDOW_MS);
    messageBuffer.set(userId, {
      texts: [parsed.cleanText],
      ctx,
      chatId: ctx.chat.id,
      timer,
      explicitTags: [...parsed.explicitTags],
      statusOverride: parsed.statusOverride,
      typeTag: parsed.typeTag,
      targetFolder: parsed.targetFolder,
      forwardInfo,
    });
  }
}
