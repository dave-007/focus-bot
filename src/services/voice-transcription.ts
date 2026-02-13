import type { Api } from 'grammy';
import { config } from '../config.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/**
 * Download a voice file from Telegram servers.
 */
export async function downloadVoiceFile(
  fileId: string,
  api: Api,
  botToken: string
): Promise<Buffer> {
  const file = await api.getFile(fileId);
  if (!file.file_path) {
    throw new Error('Telegram did not return a file_path');
  }
  const url = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download voice file: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Transcribe audio using Groq Whisper API.
 * Accepts OGG Opus (Telegram voice format) natively.
 */
export async function transcribeVoice(audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(audioBuffer)], { type: 'audio/ogg' }), 'voice.ogg');
  formData.append('model', 'whisper-large-v3-turbo');

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.GROQ_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Whisper API error ${response.status}: ${errorText}`);
  }

  const result = await response.json() as { text: string };
  return result.text.trim();
}
