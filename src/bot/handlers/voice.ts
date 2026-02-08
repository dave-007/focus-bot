import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Context } from 'grammy';
import sanitize from 'sanitize-filename';
import { config } from '../../config.js';
import { downloadVoiceFile, transcribeVoice } from '../../services/voice-transcription.js';
import { processVoiceInput, type VoiceAIResult } from '../../services/voice-ai.js';
import {
  getSession,
  createSession,
  updateSession,
  deleteSession,
  findSessionByDraftMessage,
  type VoiceSession,
} from '../../services/voice-session.js';

/**
 * Format the draft message as an Obsidian note preview.
 */
function formatDraftMessage(title: string, tags: string[], body: string): string {
  const allTags = tags.includes('captures') ? tags : ['captures', ...tags];
  const tagsBlock = allTags.map((t) => `  - _${t}_`).join('\n');
  return `*${title}*\u200B.md\n\n---\nTags:\n${tagsBlock}\n---\n${body}`;
}

/**
 * Format a Date as YYYY-MM-DDTHH:mm (local time, Obsidian-friendly).
 */
function formatLocalDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Generate a safe filename from a title.
 */
function generateFilename(title: string): string {
  const sanitized = sanitize(title, { replacement: '-' });
  if (!sanitized) {
    return `note-${Date.now()}.md`;
  }
  return `${sanitized}.md`;
}

/**
 * Write the note to the vault.
 */
function saveNoteToVault(title: string, tags: string[], body: string): string {
  const captured = formatLocalDatetime(new Date());
  const allTags = tags.includes('captures') ? tags : ['captures', ...tags];
  const tagsYaml = allTags.map((t) => `  - ${t}`).join('\n');

  const content = `---
captured: ${captured}
source: telegram-voice
status: inbox
tags:
${tagsYaml}
---
${body}
`;

  const filename = generateFilename(title);
  const filePath = path.join(config.NOTES_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Process a draft result: create or update session + Telegram message.
 */
async function handleDraftResult(
  ctx: Context,
  userId: number,
  chatId: number,
  result: VoiceAIResult & { action: 'draft' },
  inputText: string,
  responseJson: string
): Promise<void> {
  const session = getSession(userId);

  if (session) {
    // Update existing draft message
    await ctx.api.editMessageText(
      chatId,
      session.draftMessageId,
      formatDraftMessage(result.title, result.tags, result.body),
      { parse_mode: 'Markdown' }
    );
    updateSession(userId, {
      draft: result.body,
      title: result.title,
      tags: result.tags,
      conversationHistory: [
        ...session.conversationHistory,
        { role: 'user' as const, content: inputText },
        { role: 'assistant' as const, content: responseJson },
      ],
    });
  } else {
    // Send new draft message
    const draftMsg = await ctx.api.sendMessage(
      chatId,
      formatDraftMessage(result.title, result.tags, result.body),
      { parse_mode: 'Markdown' }
    );
    createSession(userId, {
      draft: result.body,
      title: result.title,
      tags: result.tags,
      chatId,
      draftMessageId: draftMsg.message_id,
      conversationHistory: [
        { role: 'user' as const, content: inputText },
        { role: 'assistant' as const, content: responseJson },
      ],
    });
  }
}

/**
 * Save the current session's note to the vault.
 */
async function handleSave(
  ctx: Context,
  userId: number,
  chatId: number
): Promise<void> {
  const session = getSession(userId);
  if (!session) {
    await ctx.api.sendMessage(chatId, 'No active voice note to save.');
    return;
  }

  const filePath = saveNoteToVault(session.title, session.tags, session.draft);
  console.log(`[voice] Saved note: ${filePath}`);

  // Update draft message to show saved confirmation (keep full note visible)
  await ctx.api.editMessageText(
    chatId,
    session.draftMessageId,
    formatDraftMessage(`\u2705 ${session.title}`, session.tags, session.draft),
    { parse_mode: 'Markdown' }
  );

  deleteSession(userId);
}

/**
 * Cancel the current session.
 */
async function handleCancel(
  ctx: Context,
  userId: number,
  chatId: number
): Promise<void> {
  const session = getSession(userId);
  if (!session) {
    await ctx.api.sendMessage(chatId, 'No active voice note to cancel.');
    return;
  }

  deleteSession(userId);

  await ctx.api.editMessageText(
    chatId,
    session.draftMessageId,
    '\u274c Draft discarded.'
  );
}

/**
 * Core logic: process input text (from voice transcription or typed text) through the voice AI.
 */
export async function processVoiceSessionInput(
  ctx: Context,
  userId: number,
  chatId: number,
  inputText: string
): Promise<void> {
  const session = getSession(userId) ?? null;
  const result = await processVoiceInput(inputText, session);
  const responseJson = JSON.stringify(result);

  switch (result.action) {
    case 'draft':
      await handleDraftResult(ctx, userId, chatId, result, inputText, responseJson);
      break;
    case 'save':
      await handleSave(ctx, userId, chatId);
      break;
    case 'cancel':
      await handleCancel(ctx, userId, chatId);
      break;
  }
}

/**
 * Handle incoming voice messages.
 */
export async function handleVoiceMessage(ctx: Context): Promise<void> {
  const voice = ctx.message?.voice;
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!voice || !userId || !chatId) return;

  try {
    await ctx.api.sendChatAction(chatId, 'typing');

    const audioBuffer = await downloadVoiceFile(
      voice.file_id,
      ctx.api,
      config.TELEGRAM_BOT_TOKEN
    );

    const transcription = await transcribeVoice(audioBuffer);
    if (!transcription) {
      await ctx.reply('Could not transcribe the voice message. Please try again.');
      return;
    }

    await processVoiceSessionInput(ctx, userId, chatId, transcription);
  } catch (error) {
    console.error('[voice] Handler error:', error);
    await ctx.reply('Something went wrong processing your voice note. Please try again.');
  }
}

/**
 * Handle message reactions — 👍 on a draft message triggers save.
 */
export async function handleReaction(ctx: Context): Promise<void> {
  const reaction = ctx.messageReaction;
  if (!reaction) return;

  const chatId = reaction.chat.id;
  const messageId = reaction.message_id;

  // Check if any new reaction is a thumbs up
  const hasThumbsUp = reaction.new_reaction?.some(
    (r) => r.type === 'emoji' && r.emoji === '\ud83d\udc4d'
  );
  if (!hasThumbsUp) return;

  const found = findSessionByDraftMessage(chatId, messageId);
  if (!found) return;

  try {
    await handleSave(ctx, found.userId, chatId);
  } catch (error) {
    console.error('[voice] Reaction save error:', error);
  }
}
