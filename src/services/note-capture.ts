import * as fs from 'node:fs';
import * as path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { config, BOOKMARKS_DIR } from '../config.js';
import { fetchPageMetadata } from '../utils/html-metadata.js';
import { resolveFilePath } from '../utils/filename.js';
import { extractUrls } from '../utils/url.js';
import { getPrompt } from './prompts.js';
import { logLLMExchange } from '../utils/transcript-log.js';

const CLAUDE_CODE_PATH = process.env.CLAUDE_CODE_PATH || 'claude';

/**
 * Schema for note metadata extracted by Claude.
 */
const NoteMetadataSchema = z.object({
  title: z.string().min(1).max(100),
  tags: z.array(z.string()).min(1).max(8),
  body: z.string().min(1),
});

type NoteMetadata = z.infer<typeof NoteMetadataSchema>;

export interface CaptureResult {
  title: string;
  filePath: string;
  urls: string[];
}

const MODEL_CASCADE = [
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-6',
] as const;

/**
 * Try extracting metadata with a single model. Throws on any failure.
 */
async function tryExtractWithModel(model: string, assembledPrompt: string): Promise<NoteMetadata> {
  for await (const msg of query({
    prompt: assembledPrompt,
    options: {
      model,
      maxTurns: 2,
      tools: [],
      pathToClaudeCodeExecutable: CLAUDE_CODE_PATH,
    },
  })) {
    if (msg.type === 'result') {
      const response = msg.subtype === 'success' ? msg.result : null;
      logLLMExchange('NOTE CAPTURE', assembledPrompt, response);
      if (msg.subtype === 'success' && msg.result) {
        const jsonMatch = msg.result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }
        const parsed = NoteMetadataSchema.safeParse(JSON.parse(jsonMatch[0]));
        if (parsed.success) {
          return parsed.data;
        }
        throw new Error(`Metadata validation failed: ${parsed.error.message}`);
      }
      throw new Error(`Metadata extraction failed: ${msg.subtype}`);
    }
  }

  throw new Error('No result from metadata extraction');
}

/**
 * Generate raw metadata from the message text without any AI call.
 */
function generateRawMetadata(message: string): NoteMetadata {
  const trimmed = message.trim();
  const titleSource = trimmed.replace(/\n/g, ' ').slice(0, 60);
  const lastSpace = titleSource.lastIndexOf(' ');
  const title = lastSpace > 20 ? titleSource.slice(0, lastSpace) : titleSource;

  return { title, tags: ['captures'], body: trimmed };
}

/**
 * Extract title, tags, and wiki-linked body from a message using Claude.
 * Tries sonnet → haiku → opus, then falls back to raw capture.
 */
async function extractMetadata(message: string, urls: string[], urlMeta?: { title: string | null; description: string | null; siteName: string | null }): Promise<NoteMetadata> {
  let urlContext = '';
  if (urls.length > 0) {
    const metaLines: string[] = [`This message contains URL(s): ${urls.join(', ')}`];
    if (urlMeta?.title) metaLines.push(`Page title: "${urlMeta.title}"`);
    if (urlMeta?.description) metaLines.push(`Page description: "${urlMeta.description}"`);
    if (urlMeta?.siteName) metaLines.push(`Site: ${urlMeta.siteName}`);
    metaLines.push('The message is sharing a link/bookmark. Consider tags like "links" or "articles". Use the page title/description to generate a descriptive note title.');
    urlContext = '\n\n' + metaLines.join('\n');
  }

  const assembledPrompt = getPrompt('note-capture', { message, urlContext });

  for (const model of MODEL_CASCADE) {
    try {
      return await tryExtractWithModel(model, assembledPrompt);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      console.log(`[capture] ${model} failed: ${reason}, trying next...`);
    }
  }

  console.log(`[capture] All models failed, using raw capture for: ${message.slice(0, 50)}...`);
  return generateRawMetadata(message);
}

/**
 * Format a Date as YYYY-MM-DDTHH:mm (local time, Obsidian-friendly).
 */
function formatLocalDatetime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Generate markdown content with YAML frontmatter.
 * Title is omitted — the filename IS the title in Obsidian.
 */
function generateNoteContent(metadata: NoteMetadata, url?: string): string {
  const captured = formatLocalDatetime(new Date());

  // Ensure captures tag is always included (code-enforced, prepended)
  const allTags = metadata.tags.includes('captures')
    ? metadata.tags
    : ['captures', ...metadata.tags];

  const tagsYaml = allTags
    .map((t) => `  - ${t}`)
    .join('\n');
  const urlLine = url ? `\nurl: "${url}"` : '';

  return `---
captured: ${captured}
source: telegram
status: inbox${urlLine}
tags:
${tagsYaml}
---
${metadata.body}
`;
}

/**
 * Capture a message as a note: extract metadata, generate content, write file.
 */
export async function captureNote(
  message: string
): Promise<CaptureResult> {
  const urls = extractUrls(message);
  const primaryUrl = urls.length > 0 ? urls[0] : undefined;

  // Pre-fetch page metadata so Claude can generate a descriptive title for URL-only messages
  const urlMeta = primaryUrl ? await fetchPageMetadata(primaryUrl) : undefined;

  const metadata = await extractMetadata(message, urls, urlMeta);
  const content = generateNoteContent(metadata, primaryUrl);
  const targetDir = urls.length > 0 ? BOOKMARKS_DIR : config.NOTES_DIR;
  const filePath = resolveFilePath(metadata.title, targetDir);
  fs.writeFileSync(filePath, content, 'utf-8');

  return { title: metadata.title, filePath, urls };
}
