import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Context } from 'grammy';
import { config } from '../../config.js';
import { captureNote } from '../../services/note-capture.js';
import { processNote } from '../../services/note-enrichment.js';
import { resolveFilePath } from '../../utils/filename.js';

/**
 * Directory for storing attached files in the vault.
 */
const FILES_DIR = path.join(config.NOTES_DIR, 'Files');

/**
 * Ensure the Files directory exists.
 */
export function ensureFilesDir(): void {
  if (!fs.existsSync(FILES_DIR)) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
    console.log(`Created files directory: ${FILES_DIR}`);
  }
}

/**
 * Download a file from Telegram servers by file_id.
 */
async function downloadTelegramFile(
  fileId: string,
  api: Context['api']
): Promise<{ buffer: Buffer; filePath: string }> {
  const file = await api.getFile(fileId);
  if (!file.file_path) {
    throw new Error('Telegram did not return a file_path');
  }
  const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status}`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    filePath: file.file_path,
  };
}

/**
 * Save a file to the vault's Files directory with a unique name.
 * Returns the filename (for Obsidian embedding).
 */
function saveFileToVault(buffer: Buffer, originalName: string): string {
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  const targetPath = resolveFilePath(base, FILES_DIR).replace(/\.md$/, ext);

  fs.writeFileSync(targetPath, buffer);
  return path.basename(targetPath);
}

/**
 * Build a message string for note capture from document metadata and caption.
 */
function buildDocumentMessage(
  fileName: string,
  savedFileName: string,
  caption: string | undefined,
  mimeType: string | undefined
): string {
  const parts: string[] = [];

  if (caption) {
    parts.push(caption);
  }

  parts.push(`\n![[${savedFileName}]]`);

  if (!caption) {
    parts.push(`\nAttached file: ${fileName} (${mimeType ?? 'unknown type'})`);
  }

  return parts.join('\n');
}

/**
 * Handle incoming document messages (files, PDFs, etc.).
 */
export async function handleDocumentMessage(ctx: Context): Promise<void> {
  const doc = ctx.message?.document;
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!doc || !userId || !chatId) return;

  try {
    await ctx.api.sendChatAction(chatId, 'upload_document');

    const { buffer } = await downloadTelegramFile(doc.file_id, ctx.api);
    const fileName = doc.file_name ?? `file-${Date.now()}`;
    const savedFileName = saveFileToVault(buffer, fileName);
    console.log(`[document] Saved file: ${path.join(FILES_DIR, savedFileName)}`);

    const caption = ctx.message?.caption;
    const message = buildDocumentMessage(fileName, savedFileName, caption, doc.mime_type);

    await ctx.api.sendChatAction(chatId, 'typing');
    const result = await captureNote(message);
    await ctx.react('👍');

    const messageId = ctx.message?.message_id;
    processNote(result.filePath, result.urls, messageId ? {
      chatId,
      messageId,
      api: ctx.api,
    } : undefined).catch((error) => {
      console.error('[enrichment] Failed:', error);
    });
  } catch (error) {
    console.error('[document] Handler error:', error);
    await ctx.reply('Failed to save document. Please try again.');
  }
}

/**
 * Handle incoming photo messages.
 */
export async function handlePhotoMessage(ctx: Context): Promise<void> {
  const photos = ctx.message?.photo;
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!photos || photos.length === 0 || !userId || !chatId) return;

  try {
    await ctx.api.sendChatAction(chatId, 'upload_photo');

    // Use the largest photo (last in array)
    const photo = photos[photos.length - 1];
    const { buffer } = await downloadTelegramFile(photo.file_id, ctx.api);
    const fileName = `photo-${Date.now()}.jpg`;
    const savedFileName = saveFileToVault(buffer, fileName);
    console.log(`[document] Saved photo: ${path.join(FILES_DIR, savedFileName)}`);

    const caption = ctx.message?.caption;
    const message = buildDocumentMessage(fileName, savedFileName, caption, 'image/jpeg');

    await ctx.api.sendChatAction(chatId, 'typing');
    const result = await captureNote(message);
    await ctx.react('👍');

    const messageId = ctx.message?.message_id;
    processNote(result.filePath, result.urls, messageId ? {
      chatId,
      messageId,
      api: ctx.api,
    } : undefined).catch((error) => {
      console.error('[enrichment] Failed:', error);
    });
  } catch (error) {
    console.error('[document] Photo handler error:', error);
    await ctx.reply('Failed to save photo. Please try again.');
  }
}
