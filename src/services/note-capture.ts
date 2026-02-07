import * as fs from 'node:fs';
import * as path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import sanitize from 'sanitize-filename';
import { config, loadCategories, BOOKMARKS_DIR } from '../config.js';
import { fetchPageMetadata } from '../utils/html-metadata.js';
import { extractUrls } from '../utils/url.js';

const CLAUDE_CODE_PATH =
  process.env.CLAUDE_CODE_PATH || 'claude';

/**
 * Schema for note metadata extracted by Claude.
 */
const NoteMetadataSchema = z.object({
  title: z.string().min(1).max(100),
  categories: z.array(z.string()).min(1).max(5),
  topics: z.array(z.string()).min(2).max(5),
  body: z.string().min(1),
});

type NoteMetadata = z.infer<typeof NoteMetadataSchema>;

export interface CaptureResult {
  title: string;
  filePath: string;
  urls: string[];
}

/**
 * Extract title, categories, topics, and wiki-linked body from a message using Claude.
 */
async function extractMetadata(message: string, urls: string[], urlMeta?: { title: string | null; description: string | null; siteName: string | null }): Promise<NoteMetadata> {
  const categories = loadCategories();
  const categoryList = categories.join(', ');

  let urlContext = '';
  if (urls.length > 0) {
    const metaLines: string[] = [`This message contains URL(s): ${urls.join(', ')}`];
    if (urlMeta?.title) metaLines.push(`Page title: "${urlMeta.title}"`);
    if (urlMeta?.description) metaLines.push(`Page description: "${urlMeta.description}"`);
    if (urlMeta?.siteName) metaLines.push(`Site: ${urlMeta.siteName}`);
    metaLines.push('The message is sharing a link/bookmark. Consider categories like "Clippings" or "References" if available. Use the page title/description to generate a descriptive note title.');
    urlContext = '\n\n' + metaLines.join('\n');
  }

  for await (const msg of query({
    prompt: `Analyze this message and generate metadata for an Obsidian note.

Message:
${message}${urlContext}

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{"title": "A concise descriptive title", "categories": ["Category1", "Category2"], "topics": ["Topic One", "Topic Two", "Topic Three"], "body": "The message with [[wiki-links]] inserted around key concepts."}

Requirements:
- title: 1-100 characters, concise and descriptive
- categories: Pick 1-5 from ONLY this list: ${categoryList}
- topics: 2-5 topic names as natural phrases (capitalized, e.g. "Machine Learning", "Philosophy")
- body: Rewrite the original message inserting [[wiki-links]] around key concepts, important nouns, and proper names. Preserve the original meaning and wording exactly -- only add [[ and ]] around terms worth linking. Link both well-known concepts and ideas worth exploring further. NEVER insert [[wiki-links]] inside URLs -- keep all URLs exactly as they appear in the original message.`,
    options: {
      model: config.CAPTURE_MODEL,
      maxTurns: 1,
      pathToClaudeCodeExecutable: CLAUDE_CODE_PATH,
    },
  })) {
    if (msg.type === 'result') {
      if (msg.subtype === 'success' && msg.result) {
        const jsonMatch = msg.result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }
        const parsed = NoteMetadataSchema.safeParse(JSON.parse(jsonMatch[0]));
        if (parsed.success) {
          return parsed.data;
        }
        throw new Error(
          `Metadata validation failed: ${parsed.error.message}`
        );
      }
      throw new Error(`Metadata extraction failed: ${msg.subtype}`);
    }
  }

  throw new Error('No result from metadata extraction');
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

  // Ensure [[Captures]] is always included
  const allCategories = metadata.categories.includes('Captures')
    ? metadata.categories
    : ['Captures', ...metadata.categories];

  const categoriesYaml = allCategories
    .map((c) => `  - "[[${c}]]"`)
    .join('\n');
  const topicsYaml = metadata.topics
    .map((t) => `  - "[[${t}]]"`)
    .join('\n');
  const urlLine = url ? `\nurl: "${url}"` : '';

  return `---
captured: ${captured}
source: telegram
status: inbox${urlLine}
categories:
${categoriesYaml}
topics:
${topicsYaml}
---
${metadata.body}
`;
}

/**
 * Generate a safe filename from a title.
 * Preserves spaces for Obsidian compatibility.
 */
function generateFilename(title: string): string {
  const sanitized = sanitize(title, { replacement: '-' });
  if (!sanitized) {
    return `note-${Date.now()}.md`;
  }
  return `${sanitized}.md`;
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
  const filename = generateFilename(metadata.title);
  const content = generateNoteContent(metadata, primaryUrl);
  const targetDir = urls.length > 0 ? BOOKMARKS_DIR : config.NOTES_DIR;
  const filePath = path.join(targetDir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');

  return { title: metadata.title, filePath, urls };
}
