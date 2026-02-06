import { Context } from 'grammy';
import { captureNote } from '../../services/note-capture.js';
import { processNote } from '../../services/note-enrichment.js';

export async function handleTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  if (!text) return;

  try {
    const result = await captureNote(text);
    await ctx.reply(`Saved: ${result.title}`);

    // Fire-and-forget: async enrichment (does not block user)
    processNote(result.filePath).catch((error) => {
      console.error('[enrichment] Failed:', error);
    });
  } catch (error) {
    console.error('Note capture failed:', error);
    await ctx.reply('Failed to save note. Please try again.');
  }
}
