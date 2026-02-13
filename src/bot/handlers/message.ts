import { Context } from 'grammy';
import { captureNote } from '../../services/note-capture.js';
import { processNote } from '../../services/note-enrichment.js';
import { hasSession } from '../../services/voice-session.js';
import { processVoiceSessionInput } from './voice.js';

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

  try {
    await ctx.api.sendChatAction(ctx.chat.id, 'typing');
    const result = await captureNote(text);
    await ctx.react('👍');

    // Fire-and-forget: async enrichment (does not block user)
    const messageId = ctx.message?.message_id;
    processNote(result.filePath, result.urls, messageId ? {
      chatId: ctx.chat.id,
      messageId,
      api: ctx.api,
    } : undefined).catch((error) => {
      console.error('[enrichment] Failed:', error);
    });
  } catch (error) {
    console.error('Note capture failed:', error);
    await ctx.reply('Failed to save note. Please try again.');
  }
}
