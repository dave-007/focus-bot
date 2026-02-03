import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import sanitize from 'sanitize-filename';
import { config } from '../config.js';

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

/**
 * Extract title and tags from a message using Claude's structured output.
 */
async function extractMetadata(message: string): Promise<NoteMetadata> {
  const schema = z.toJSONSchema(NoteMetadataSchema);

  for await (const msg of query({
    prompt: `Analyze this message and generate a title and 3-5 relevant tags.

Message:
${message}

Generate a concise, descriptive title and 3-5 lowercase kebab-case tags that capture the subject matter.`,
    options: {
      model: 'sonnet',
      maxTurns: 1,
      outputFormat: { type: 'json_schema', schema },
    },
  })) {
    if (msg.type === 'result') {
      if (msg.subtype === 'success' && msg.structured_output) {
        const parsed = NoteMetadataSchema.safeParse(msg.structured_output);
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
 * Generate markdown content with YAML frontmatter.
 */
function generateNoteContent(
  metadata: NoteMetadata,
  originalMessage: string
): string {
  const created = new Date().toISOString();
  const tagsYaml = metadata.tags.map((tag) => `  - ${tag}`).join('\n');

  return `---
title: ${metadata.title}
created: ${created}
tags:
${tagsYaml}
---

${originalMessage}
`;
}

/**
 * Generate a safe filename from a title.
 */
function generateFilename(title: string): string {
  const sanitized = sanitize(title, { replacement: '-' });
  if (!sanitized) {
    // Fallback for edge cases like ".." -> ""
    return `note-${Date.now()}.md`;
  }
  return `${sanitized}.md`;
}

/**
 * Write the note file to NOTES_DIR using Claude Agent SDK.
 */
async function writeNoteFile(
  filename: string,
  content: string
): Promise<void> {
  // Block all tools except Write
  const disallowedTools = [
    'Bash',
    'Read',
    'Edit',
    'Glob',
    'Grep',
    'WebFetch',
    'WebSearch',
    'Task',
    'NotebookEdit',
    'TodoWrite',
    'BashOutput',
    'KillShell',
    'SlashCommand',
  ];

  for await (const msg of query({
    prompt: `Write the following content to the file "${filename}":

${content}`,
    options: {
      cwd: config.NOTES_DIR,
      disallowedTools,
      permissionMode: 'acceptEdits',
      maxTurns: 3,
    },
  })) {
    if (msg.type === 'result') {
      if (msg.subtype !== 'success') {
        throw new Error(`File write failed: ${msg.subtype}`);
      }
      return;
    }
  }

  throw new Error('No result from file write');
}

/**
 * Capture a message as a note: extract metadata, generate content, write file.
 */
export async function captureNote(
  message: string
): Promise<{ title: string }> {
  // Phase 1: Extract metadata with structured output
  const metadata = await extractMetadata(message);

  // Phase 2: Generate filename and content
  const filename = generateFilename(metadata.title);
  const content = generateNoteContent(metadata, message);

  // Phase 3: Write file to vault
  await writeNoteFile(filename, content);

  return { title: metadata.title };
}
