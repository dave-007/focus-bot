import * as fs from 'node:fs';
import * as path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import sanitize from 'sanitize-filename';
import { CAPTURES_DIR } from '../config.js';

// Path to Claude Code executable
const CLAUDE_CODE_PATH =
  process.env.CLAUDE_CODE_PATH ||
  '/home/n8bot/.vscode/extensions/anthropic.claude-code-2.1.31-linux-x64/resources/native-binary/claude';

/**
 * Schema for note metadata extracted by Claude.
 */
const NoteMetadataSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(100)
    .describe('A concise, descriptive title for the note (1-100 chars)'),
  tags: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe('3-5 relevant tags as lowercase kebab-case'),
});

type NoteMetadata = z.infer<typeof NoteMetadataSchema>;

export interface CaptureResult {
  title: string;
  filePath: string;
}

/**
 * Extract title and tags from a message using Claude.
 */
async function extractMetadata(message: string): Promise<NoteMetadata> {
  for await (const msg of query({
    prompt: `Analyze this message and generate a title and 3-5 relevant tags.

Message:
${message}

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{"title": "A concise descriptive title", "tags": ["tag-one", "tag-two", "tag-three"]}

Requirements:
- title: 1-100 characters, descriptive
- tags: 3-5 lowercase kebab-case strings`,
    options: {
      model: 'haiku',
      maxTurns: 1,
      pathToClaudeCodeExecutable: CLAUDE_CODE_PATH,
    },
  })) {
    if (msg.type === 'result') {
      if (msg.subtype === 'success' && msg.result) {
        // Parse JSON from the text result
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
function generateNoteContent(
  metadata: NoteMetadata,
  originalMessage: string
): string {
  const created = formatLocalDatetime(new Date());
  const tagsYaml = metadata.tags.map((tag) => `  - ${tag}`).join('\n');

  return `---
created: ${created}
tags:
${tagsYaml}
source: telegram
status: inbox
---

${originalMessage}
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
  // Phase 1: Extract metadata with Claude
  const metadata = await extractMetadata(message);

  // Phase 2: Generate filename and content
  const filename = generateFilename(metadata.title);
  const content = generateNoteContent(metadata, message);

  // Phase 3: Write file directly to Captures/ directory
  const filePath = path.join(CAPTURES_DIR, filename);
  fs.writeFileSync(filePath, content, 'utf-8');

  return { title: metadata.title, filePath };
}
