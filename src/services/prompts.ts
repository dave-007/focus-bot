import * as fs from 'node:fs';
import * as path from 'node:path';
import { PROMPTS_DIR } from '../config.js';

const NAMESPACE = 'Focus Bot';

export type PromptName = 'note-capture' | 'voice-assistant' | 'video-summary' | 'article-summary';

// ---------------------------------------------------------------------------
// Default prompts (single source of truth — also seeded to Markdown files)
// ---------------------------------------------------------------------------

const DEFAULT_PROMPTS: Record<PromptName, string> = {
  'note-capture': `Analyze this message and generate metadata for an Obsidian note.

Message:
{{message}}{{urlContext}}

Respond with ONLY a JSON object (no markdown, no explanation) in this exact format:
{"title": "A concise descriptive title", "tags": ["quotes"], "body": "The message with [[wiki-links]] inserted around key concepts."}

Requirements:
- title: 1-100 characters, concise and descriptive
- tags: 1-8 tags describing the TYPE of capture (not the topic). Always plural. Examples: books, movies, quotes, ideas, articles, links, recipes, poems, songs, tools. Detect implicit type signals (e.g. attribution line → quotes, URL → links or articles). Honor any explicit tags the user includes in their message. Do NOT use tags for subject matter — wiki-links in the body handle that. Do NOT include "captures" — it is added automatically.
- body: Rewrite the original message inserting [[wiki-links]] around key concepts, important nouns, and proper names. Preserve the original meaning and wording exactly -- only add [[ and ]] around terms worth linking. Link both well-known concepts and ideas worth exploring further. Only link the FIRST occurrence of each term — do not repeat [[wiki-links]] for the same concept. NEVER insert [[wiki-links]] inside URLs -- keep all URLs exactly as they appear in the original message.`,

  'voice-assistant': `You are a voice note assistant for an Obsidian vault. The user dictates notes via voice messages (transcribed to text). Your job is to maintain a structured note with a title, tags, and body.

Rules:
- Clean up ALL filler words (um, uh, like, you know), repeated phrases, false starts, and verbal artifacts. Output standard written prose, not a voice transcription.
- If the user's message starts with an instruction prefix like "take a new note", "new note", "capture this", etc., strip the prefix and use only the content portion.
- title: 1-100 characters, concise and descriptive, suitable as a filename
- tags: 1-8 tags describing the TYPE of capture (not the topic). Always plural. Examples: ideas, quotes, articles, reflections, observations, recipes, poems, tools. Do NOT include "captures" — it is added automatically. Do NOT use tags for subject matter — wiki-links in the body handle that.
- body: Insert [[wiki-links]] around key concepts, important nouns, and proper names. Only link the FIRST occurrence of each term. Preserve the user's meaning exactly — only add [[ and ]] around terms worth linking.
- When the user gives editing instructions (continue, replace, remove, change, add, etc.), interpret them and return the COMPLETE updated note.
- When the user says to save, finish, or is done, return a save action.
- When the user says to cancel, discard, or never mind, return a cancel action.

Respond with ONLY a JSON object (no markdown, no explanation) in one of these formats:
{"action": "draft", "title": "Note Title", "tags": ["ideas"], "body": "Clean prose with [[wiki-links]]..."}
{"action": "save"}
{"action": "cancel"}`,

  'video-summary': `{{titleContext}}Provide a detailed, in-depth summary of this video transcript. This summary is the primary representation of this video's content, so be thorough.

Structure your response as:
- A 2-3 sentence overview of the main topic and thesis
- Key points, arguments, and ideas discussed (as bullet points — be comprehensive)
- Notable quotes, statistics, or specific claims worth remembering
- Conclusions or takeaways

Write in plain text. Use bullet points (- ) for lists. Do not use markdown headers or bold.

Transcript:
{{transcript}}`,

  'article-summary': `{{titleContext}}Summarize this article in a clear, structured format.

Structure your response as:
- A 1-2 sentence overview of what the article is about
- Key points and insights (as bullet points)
- Notable data, quotes, or specific claims worth remembering

Write in plain text. Use bullet points (- ) for lists. Do not use markdown headers or bold.

Article text:
{{articleText}}`,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a prompt by name, optionally substituting template variables.
 * Reads from the user's prompts directory (real-time) if configured,
 * otherwise returns the built-in default.
 */
export function getPrompt(name: PromptName, vars?: Record<string, string>): string {
  let template = DEFAULT_PROMPTS[name];

  if (PROMPTS_DIR) {
    const filePath = path.join(PROMPTS_DIR, NAMESPACE, `${name}.md`);
    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      if (content.length > 0) {
        template = content;
      }
    } catch {
      // File doesn't exist or can't be read — use default
    }
  }

  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      template = template.replaceAll(`{{${key}}}`, value);
    }
  }

  return template;
}

/**
 * Seed the prompts directory with default prompt files.
 * Creates the directory and writes any missing files.
 * No-op if PROMPTS_DIR is not configured.
 */
export function seedPrompts(): void {
  if (!PROMPTS_DIR) return;

  const namespaceDir = path.join(PROMPTS_DIR, NAMESPACE);

  // Ensure directory tree exists
  if (!fs.existsSync(namespaceDir)) {
    fs.mkdirSync(namespaceDir, { recursive: true });
    console.log(`Created prompts directory: ${namespaceDir}`);
  }

  // Write any missing prompt files
  for (const [name, content] of Object.entries(DEFAULT_PROMPTS)) {
    const filePath = path.join(namespaceDir, `${name}.md`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`  Seeded ${name}.md`);
    }
  }
}
