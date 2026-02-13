import * as fs from 'node:fs';
import { config } from '../config.js';

function appendToLog(entry: string): void {
  try {
    fs.appendFileSync(config.TRANSCRIPT_LOG, entry, 'utf-8');
  } catch (error) {
    console.warn('[transcript-log] Failed to write:', error);
  }
}

/**
 * Append a plain-text transcript entry to the debug log file.
 */
export function logTranscript(text: string): void {
  const timestamp = new Date().toISOString();
  appendToLog(`[${timestamp}] TRANSCRIPT\n${text}\n\n`);
}

/**
 * Log a full LLM prompt exchange: the assembled prompt sent and the response received.
 */
export function logLLMExchange(label: string, prompt: string, response: string | null): void {
  const timestamp = new Date().toISOString();
  const divider = '─'.repeat(60);
  appendToLog(`[${timestamp}] ${label}
${divider}
PROMPT:
${divider}
${prompt}
${divider}
RESPONSE:
${divider}
${response ?? '(no response)'}
${divider}

`);
}
