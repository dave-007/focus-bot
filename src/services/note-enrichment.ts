import * as fs from 'node:fs';
import * as path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Api } from 'grammy';
import { config } from '../config.js';
import { fetchPageMetadata, PageMetadata } from '../utils/html-metadata.js';
import { fetchArticleText } from '../utils/html-text.js';
import { appendToNoteBody, parseNote, assembleNote } from '../utils/note-parser.js';
import { isYouTubeUrl, fetchTranscript } from '../utils/youtube.js';
import { createTelegraphPage } from '../utils/telegraph.js';
import { getPrompt } from './prompts.js';
import { logLLMExchange } from '../utils/transcript-log.js';

export interface EnrichmentContext {
  chatId: number;
  messageId: number;
  api: Api;
}

const CLAUDE_CODE_PATH = process.env.CLAUDE_CODE_PATH || 'claude';

/**
 * Process a captured note for enrichment.
 * For YouTube URLs: fetches transcript, generates AI summary.
 * For other URLs: fetches page metadata and appends link preview.
 */
export async function processNote(filePath: string, urls: string[], tg?: EnrichmentContext): Promise<void> {
  if (urls.length === 0) {
    // No URLs to enrich, but still signal completion
    if (tg) {
      try {
        await tg.api.setMessageReaction(tg.chatId, tg.messageId, [{ type: 'emoji', emoji: '💯' }]);
      } catch (error) {
        console.warn('[enrichment] Failed to set reaction:', error);
      }
    }
    return;
  }

  console.log(`[enrichment] Processing ${urls.length} URL(s) in ${filePath}`);

  const sections: string[] = [];

  for (const url of urls) {
    try {
      if (isYouTubeUrl(url)) {
        const section = await enrichYouTube(url);
        if (section) sections.push(section);
      } else {
        const section = await enrichGenericUrl(url);
        if (section) sections.push(section);
      }
    } catch (error) {
      console.warn(`[enrichment] Failed to enrich ${url}:`, error);
    }
  }

  if (sections.length === 0) {
    console.log(`[enrichment] No enrichment content for ${filePath}`);
    return;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const updatedContent = appendToNoteBody(content, sections.join('\n\n'));
    fs.writeFileSync(filePath, updatedContent, 'utf-8');
    console.log(`[enrichment] Updated ${filePath}`);
  } catch (error) {
    console.error(`[enrichment] Failed to update ${filePath}:`, error);
    return;
  }

  // Publish summary to Telegraph for a readable link
  let telegraphUrl: string | null = null;
  try {
    const title = path.basename(filePath, '.md');
    const summaryText = extractSummaryFromSections(sections);
    if (summaryText) {
      telegraphUrl = await createTelegraphPage(title, summaryText, urls[0]);
      if (telegraphUrl) {
        console.log(`[enrichment] Published to Telegraph: ${telegraphUrl}`);
      }
    }
  } catch (error) {
    console.warn('[enrichment] Telegraph publishing failed:', error);
  }

  // Store Telegraph URL in note frontmatter
  if (telegraphUrl) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseNote(content);
      parsed.frontmatter += `\ntelegraph: "${telegraphUrl}"`;
      fs.writeFileSync(filePath, assembleNote(parsed), 'utf-8');
    } catch (error) {
      console.warn('[enrichment] Failed to save Telegraph URL to note:', error);
    }
  }

  // Send Telegraph link to user
  if (telegraphUrl && tg) {
    try {
      await tg.api.sendMessage(tg.chatId, telegraphUrl);
    } catch (error) {
      console.warn('[enrichment] Failed to send Telegraph URL:', error);
    }
  }

  // Signal enrichment complete with 💯 (replaces the 👍 from capture)
  if (tg) {
    try {
      await tg.api.setMessageReaction(tg.chatId, tg.messageId, [{ type: 'emoji', emoji: '💯' }]);
    } catch (error) {
      console.warn('[enrichment] Failed to set reaction:', error);
    }
  }
}

/**
 * Enrich a YouTube URL: fetch metadata + transcript, generate AI summary.
 */
async function enrichYouTube(url: string): Promise<string | null> {
  const [metadata, transcript] = await Promise.all([
    fetchPageMetadata(url),
    fetchTranscript(url),
  ]);

  const parts: string[] = [];

  // Header with video info
  if (metadata.title) {
    const siteName = metadata.siteName || 'YouTube';
    parts.push(`> **${metadata.title}**`);
    if (metadata.description) parts.push(`> ${metadata.description}`);
    parts.push(`> \u2014 ${siteName}`);
  }

  // AI summary from transcript (transcript is not saved — only used as input)
  if (transcript) {
    console.log(`[enrichment] Got transcript (${transcript.length} chars), generating summary...`);
    const summary = await summarizeTranscript(transcript, metadata.title);
    if (summary) {
      parts.push('');
      parts.push('> [!summary] Summary');
      for (const line of summary.split('\n')) {
        parts.push(`> ${line}`);
      }
    }
  } else {
    console.log(`[enrichment] No transcript available for ${url}`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Enrich a generic (non-YouTube) URL with page metadata and AI summary.
 */
async function enrichGenericUrl(url: string): Promise<string | null> {
  const [metadata, articleText] = await Promise.all([
    fetchPageMetadata(url),
    fetchArticleText(url),
  ]);

  const parts: string[] = [];

  // Header with page info
  if (metadata.title) {
    const siteName = metadata.siteName || extractDomain(url);
    parts.push(`> **${metadata.title}**`);
    if (metadata.description) parts.push(`> ${metadata.description}`);
    parts.push(`> \u2014 ${siteName}`);
  }

  // AI summary from article text
  if (articleText && articleText.length >= 200) {
    console.log(`[enrichment] Got article text (${articleText.length} chars), generating summary...`);
    const summary = await summarizeArticle(articleText, metadata.title);
    if (summary) {
      parts.push('');
      parts.push('> [!summary] Summary');
      for (const line of summary.split('\n')) {
        parts.push(`> ${line}`);
      }
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Use Claude to produce a detailed summary of a video transcript.
 */
async function summarizeTranscript(
  transcript: string,
  title: string | null
): Promise<string | null> {
  const maxChars = 50_000;
  const truncated = transcript.length > maxChars
    ? transcript.slice(0, maxChars) + '...'
    : transcript;

  const titleContext = title ? `Video title: "${title}"\n\n` : '';

  return runSummary(
    getPrompt('video-summary', { titleContext, transcript: truncated }),
    'video summary'
  );
}

/**
 * Use Claude to summarize an article's text content.
 */
async function summarizeArticle(
  text: string,
  title: string | null
): Promise<string | null> {
  const maxChars = 50_000;
  const truncated = text.length > maxChars
    ? text.slice(0, maxChars) + '...'
    : text;

  const titleContext = title ? `Article title: "${title}"\n\n` : '';

  return runSummary(
    getPrompt('article-summary', { titleContext, articleText: truncated }),
    'article summary'
  );
}

/**
 * Run a summarization prompt through Claude.
 */
async function runSummary(prompt: string, label: string): Promise<string | null> {
  try {
    for await (const msg of query({
      prompt,
      options: {
        model: config.ENRICHMENT_MODEL,
        maxTurns: 3,
        pathToClaudeCodeExecutable: CLAUDE_CODE_PATH,
      },
    })) {
      if (msg.type === 'result') {
        const response = msg.subtype === 'success' ? msg.result : null;
        logLLMExchange(`ENRICHMENT: ${label}`, prompt, response);
        if (msg.subtype === 'success' && msg.result) {
          return msg.result.trim();
        }
        console.warn(`[enrichment] ${label} failed: ${msg.subtype}`);
        return null;
      }
    }
  } catch (error) {
    console.warn(`[enrichment] Failed to generate ${label}:`, error);
  }

  return null;
}

/**
 * Extract clean summary text from enrichment sections.
 * Strips blockquote prefixes and Obsidian callout syntax for Telegraph publishing.
 */
function extractSummaryFromSections(sections: string[]): string | null {
  const allText = sections.join('\n\n');
  const lines = allText.split('\n');
  const cleaned: string[] = [];

  for (const line of lines) {
    const stripped = line.startsWith('> ') ? line.slice(2) : line;
    // Skip callout syntax line
    if (stripped.startsWith('[!summary]')) continue;
    cleaned.push(stripped);
  }

  const result = cleaned.join('\n').trim();
  return result.length > 0 ? result : null;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
