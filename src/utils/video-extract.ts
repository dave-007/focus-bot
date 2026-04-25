/**
 * Extract audio from video URLs (X/Twitter, TikTok, Instagram, etc.)
 * using yt-dlp, then transcribe via Groq Whisper.
 *
 * This is a fallback for URLs where HTML text extraction yields
 * insufficient content for summarization.
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { transcribeVoice } from '../services/voice-transcription.js';

const YT_DLP_PATH = process.env.YT_DLP_PATH || '/opt/homebrew/bin/yt-dlp';

/**
 * Domains known to host video content that yt-dlp can handle
 * and where HTML text extraction typically fails.
 */
const VIDEO_DOMAINS = [
  'x.com',
  'twitter.com',
  'tiktok.com',
  'instagram.com',
  'threads.net',
  'facebook.com',
  'fb.watch',
];

/**
 * Check if a URL is from a known video-hosting domain (non-YouTube).
 * YouTube is handled separately via its subtitle/caption pipeline.
 */
export function isVideoDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return VIDEO_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

/**
 * Download audio from a video URL using yt-dlp, then transcribe with Whisper.
 * Returns the transcription text, or null if extraction/transcription fails.
 */
export async function extractVideoTranscript(
  url: string,
  timeoutMs: number = 60_000
): Promise<string | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-audio-'));
  const outputPath = path.join(tmpDir, 'audio.ogg');

  try {
    await runYtDlp([
      '--extract-audio',
      '--audio-format', 'vorbis',
      '--audio-quality', '5',   // lower quality = smaller file, faster
      '--max-filesize', '25M',  // Groq Whisper limit
      '-o', outputPath,
      '--no-playlist',
      url,
    ], timeoutMs);

    if (!fs.existsSync(outputPath)) {
      console.log(`[video-extract] No audio file produced for ${url}`);
      return null;
    }

    const audioBuffer = Buffer.from(fs.readFileSync(outputPath));
    console.log(`[video-extract] Downloaded audio (${Math.round(audioBuffer.length / 1024)}KB), transcribing...`);

    const transcript = await transcribeVoice(audioBuffer);
    return transcript || null;
  } catch (error) {
    console.warn(`[video-extract] Failed for ${url}:`, error);
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Run yt-dlp with the given args, resolving when complete.
 */
function runYtDlp(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YT_DLP_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => { proc.kill(); reject(new Error('yt-dlp timeout')); }, timeoutMs);

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`yt-dlp exited with code ${code}: ${stderr.slice(0, 300)}`));
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
