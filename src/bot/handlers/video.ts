import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import type { Context } from 'grammy';
import { config } from '../../config.js';
import { captureNote, type CaptureOptions } from '../../services/note-capture.js';
import { processNote } from '../../services/note-enrichment.js';
import { transcribeVoice } from '../../services/voice-transcription.js';
import { extractForwardInfo } from './message.js';
import { logTranscript } from '../../utils/transcript-log.js';

const FFMPEG_PATH = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg';

/**
 * Download a video/animation file from Telegram servers.
 */
async function downloadTelegramVideo(
  fileId: string,
  api: Context['api']
): Promise<Buffer> {
  const file = await api.getFile(fileId);
  if (!file.file_path) {
    throw new Error('Telegram did not return a file_path');
  }
  const url = `https://api.telegram.org/file/bot${config.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Extract audio from a video buffer using ffmpeg.
 * Returns an OGG audio buffer suitable for Whisper, or null on failure.
 */
async function extractAudioFromVideo(videoBuffer: Buffer): Promise<Buffer | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-audio-'));
  const inputPath = path.join(tmpDir, 'input.mp4');
  const outputPath = path.join(tmpDir, 'audio.ogg');

  try {
    fs.writeFileSync(inputPath, videoBuffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_PATH, [
        '-i', inputPath,
        '-vn',                    // no video
        '-acodec', 'libvorbis',   // OGG Vorbis
        '-q:a', '3',              // decent quality, small file
        '-y',                     // overwrite
        outputPath,
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      const timer = setTimeout(() => { proc.kill(); reject(new Error('ffmpeg timeout')); }, 60_000);
      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 300)}`));
      });
      proc.on('error', (err) => { clearTimeout(timer); reject(err); });
    });

    if (!fs.existsSync(outputPath)) return null;

    const audioBuffer = Buffer.from(fs.readFileSync(outputPath));
    // Groq Whisper limit is 25MB
    if (audioBuffer.length > 25 * 1024 * 1024) {
      console.log(`[video] Audio too large for Whisper (${Math.round(audioBuffer.length / 1024 / 1024)}MB)`);
      return null;
    }

    return audioBuffer;
  } catch (error) {
    console.warn('[video] Audio extraction failed:', error);
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Build the capture message, optionally including a transcript.
 */
function buildVideoMessage(ctx: Context, transcript: string | null): string {
  const caption = ctx.message?.caption;
  const video = ctx.message?.video;
  const animation = ctx.message?.animation;
  const media = video ?? animation;
  const type = video ? 'video' : 'animation';
  const duration = media?.duration ? `${media.duration}s` : '';

  const parts: string[] = [];

  if (caption) parts.push(caption);

  if (transcript) {
    if (parts.length > 0) parts.push('');
    parts.push(transcript);
  }

  if (parts.length === 0) {
    // No caption, no transcript — construct minimal description
    if (media?.file_name) {
      parts.push(media.file_name);
    } else {
      parts.push(`Forwarded ${type}${duration ? ` (${duration})` : ''}`);
    }
  }

  return parts.join('\n');
}

/**
 * Handle incoming video messages.
 * Downloads the video, extracts audio, transcribes, and captures as a note.
 */
export async function handleVideoMessage(ctx: Context): Promise<void> {
  const video = ctx.message?.video;
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!video || !userId || !chatId) return;

  try {
    await ctx.api.sendChatAction(chatId, 'typing');

    // Download and transcribe the video
    let transcript: string | null = null;
    try {
      const videoBuffer = await downloadTelegramVideo(video.file_id, ctx.api);
      console.log(`[video] Downloaded video (${Math.round(videoBuffer.length / 1024)}KB)`);

      const audioBuffer = await extractAudioFromVideo(videoBuffer);
      if (audioBuffer) {
        console.log(`[video] Extracted audio (${Math.round(audioBuffer.length / 1024)}KB), transcribing...`);
        await ctx.api.sendChatAction(chatId, 'typing');
        transcript = await transcribeVoice(audioBuffer);
        if (transcript) {
          logTranscript(transcript);
          console.log(`[video] Transcribed ${transcript.length} chars`);
        }
      }
    } catch (error) {
      console.warn('[video] Transcription failed, continuing with caption only:', error);
    }

    const message = buildVideoMessage(ctx, transcript);
    const forwardInfo = extractForwardInfo(ctx.message);
    const options: CaptureOptions = {};
    if (forwardInfo) options.forwardInfo = forwardInfo;

    const result = await captureNote(message, options);
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
    console.error('[video] Handler error:', error);
    await ctx.reply('Failed to save video note. Please try again.');
  }
}

/**
 * Handle incoming animation messages (GIFs, short loops).
 * Animations typically don't have meaningful audio, so no transcription.
 */
export async function handleAnimationMessage(ctx: Context): Promise<void> {
  const animation = ctx.message?.animation;
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!animation || !userId || !chatId) return;

  try {
    await ctx.api.sendChatAction(chatId, 'typing');

    const message = buildVideoMessage(ctx, null);
    const forwardInfo = extractForwardInfo(ctx.message);
    const options: CaptureOptions = {};
    if (forwardInfo) options.forwardInfo = forwardInfo;

    const result = await captureNote(message, options);
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
    console.error('[video] Animation handler error:', error);
    await ctx.reply('Failed to save animation note. Please try again.');
  }
}
