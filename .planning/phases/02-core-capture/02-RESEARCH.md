# Phase 2: Core Capture - Research

**Researched:** 2026-02-03
**Domain:** Claude Agent SDK integration, text message handling, note file generation
**Confidence:** HIGH

## Summary

Phase 2 implements the core note capture flow: user sends text message, Claude analyzes it, generates title and tags, writes markdown note to vault. The research focused on three key areas: (1) Claude Agent SDK integration for analysis and file writing, (2) Grammy text message handling, and (3) filename sanitization and YAML frontmatter generation.

The Claude Agent SDK v0.2.30 provides a `query()` async generator function that streams messages and returns structured output. The SDK supports restricting tools via `disallowedTools` (NOT `allowedTools` which is broken for tool restriction). For note generation, structured output with Zod schemas ensures type-safe extraction of title and tags. Grammy's `bot.on("message:text")` filter provides type-safe text message handling.

**Primary recommendation:** Use Claude Agent SDK with structured output (Zod schema) to extract title/tags, then use Write tool to save the note. Configure `cwd` to the notes directory and use `disallowedTools` to block all tools except Write.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/claude-agent-sdk | 0.2.30 | Claude Code capabilities for analysis + file writing | Official SDK, enables tool use and structured output |
| grammy | 1.39.3 | Telegram bot framework (already installed) | Text message filtering with type inference |
| zod | 4.3.6 | Schema definition and JSON Schema conversion (already installed) | Built-in `z.toJSONSchema()` for structured output |
| sanitize-filename | 1.6.3 | Cross-platform filename sanitization | Handles Windows/Unix reserved chars, TypeScript types |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | Stack is minimal by design |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sanitize-filename | filenamify | filenamify has more options but sanitize-filename is simpler |
| Structured output | Free-form text + parsing | Structured output guarantees valid JSON, no parsing errors |

**Installation:**
```bash
npm install @anthropic-ai/claude-agent-sdk sanitize-filename
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── bot/
│   ├── handlers/
│   │   ├── command.ts      # /start, /recent handlers
│   │   └── message.ts      # NEW: text message handler
│   └── bot.ts              # Bot assembly
├── services/
│   └── note-capture.ts     # NEW: Claude Agent SDK integration
├── config.ts               # Environment config
└── index.ts                # Entry point
```

### Pattern 1: Message Handler with Service Delegation
**What:** Bot handler receives message, delegates to capture service, returns confirmation
**When to use:** Always - keeps bot code thin, business logic in services
**Example:**
```typescript
// Source: Grammy docs + project conventions
// src/bot/handlers/message.ts
import { Context } from 'grammy';
import { captureNote } from '../services/note-capture.js';

export async function handleTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  if (!text) return;

  const result = await captureNote(text);
  await ctx.reply(`Saved: ${result.title}`);
}
```

### Pattern 2: Claude Agent SDK Query with Structured Output
**What:** Use `query()` with Zod schema to get typed extraction result
**When to use:** When extracting structured data (title, tags) from user input
**Example:**
```typescript
// Source: Claude Agent SDK docs - structured outputs
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

const NoteMetadata = z.object({
  title: z.string().describe('A concise, descriptive title for the note'),
  tags: z.array(z.string()).min(3).max(5).describe('3-5 relevant tags as lowercase kebab-case')
});

type NoteMetadata = z.infer<typeof NoteMetadata>;

const schema = z.toJSONSchema(NoteMetadata);

for await (const message of query({
  prompt: `Analyze this message and extract a title and 3-5 relevant tags:\n\n${userMessage}`,
  options: {
    model: 'sonnet',
    outputFormat: { type: 'json_schema', schema }
  }
})) {
  if (message.type === 'result' && message.structured_output) {
    const parsed = NoteMetadata.safeParse(message.structured_output);
    if (parsed.success) {
      return parsed.data;
    }
  }
}
```

### Pattern 3: Two-Phase Capture (Extract then Write)
**What:** First query extracts metadata, second query writes file
**When to use:** When you need structured output AND file writing (can't combine in one query)
**Example:**
```typescript
// Phase 1: Extract metadata with structured output
const metadata = await extractMetadata(userMessage);

// Phase 2: Write file with Write tool
const filename = sanitize(metadata.title) + '.md';
const content = generateMarkdown(metadata, userMessage);

for await (const message of query({
  prompt: `Write this content to "${filename}":\n\n${content}`,
  options: {
    cwd: notesDir,
    disallowedTools: ['Bash', 'Read', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'TodoWrite', 'BashOutput', 'KillShell', 'SlashCommand'],
    permissionMode: 'acceptEdits'
  }
})) {
  if (message.type === 'result' && message.subtype === 'success') {
    return { success: true, title: metadata.title };
  }
}
```

### Anti-Patterns to Avoid
- **Using `allowedTools` to restrict tools:** Broken as of SDK v0.2.30 - shows all tools in init message. Use `disallowedTools` instead.
- **Combining structured output with file writing in one query:** Structured output is for extraction; file writing needs Write tool. Use two separate queries.
- **Building custom filename sanitization:** Edge cases abound (Windows reserved names, control characters). Use sanitize-filename library.
- **Parsing free-form text for title/tags:** Error-prone. Use structured output with JSON schema.

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filename sanitization | Regex to remove special chars | sanitize-filename | Windows reserved names (CON, PRN), control chars, trailing periods |
| Title/tag extraction | Text parsing/regex | Claude structured output | Semantic understanding, guaranteed JSON format |
| YAML frontmatter | String concatenation | Template literal | Avoid quoting issues, maintain readability |
| ISO 8601 dates | Manual formatting | `new Date().toISOString()` | Built-in, handles timezone correctly |

**Key insight:** Filename sanitization has surprising complexity (Windows has 22+ reserved names, control characters 0x00-0x1f and 0x80-0x9f, trailing periods/spaces). The sanitize-filename library handles all of this and truncates to 255 bytes.

## Common Pitfalls

### Pitfall 1: allowedTools Does Not Restrict Tools
**What goes wrong:** You set `allowedTools: ['Write']` expecting only Write tool, but Claude can use all tools.
**Why it happens:** As of v0.2.30, `allowedTools` is for permissioning, not availability. The init message still shows all tools.
**How to avoid:** Use `disallowedTools` to explicitly block unwanted tools.
**Warning signs:** Init message shows all 15+ tools despite `allowedTools` being set.

### Pitfall 2: Empty Filename After Sanitization
**What goes wrong:** User message generates title like ".." which sanitizes to empty string.
**Why it happens:** sanitize-filename removes Unix reserved names (`.`, `..`).
**How to avoid:** Always check for empty filename and provide fallback (e.g., timestamp-based name).
**Warning signs:** `fs.writeFileSync` throws ENOENT or similar error.

### Pitfall 3: Structured Output Validation Failure
**What goes wrong:** Agent returns `error_max_structured_output_retries` instead of valid output.
**Why it happens:** Schema too complex, prompt ambiguous, or content doesn't fit schema.
**How to avoid:** Keep schema simple (title: string, tags: string[]). Match schema to expected content.
**Warning signs:** Result subtype is not 'success'.

### Pitfall 4: Missing ANTHROPIC_API_KEY
**What goes wrong:** Claude Agent SDK throws authentication error.
**Why it happens:** Environment variable not set or named incorrectly.
**How to avoid:** Add ANTHROPIC_API_KEY to .env and config validation.
**Warning signs:** SDK initialization fails with auth error.

### Pitfall 5: Relative Path in cwd Option
**What goes wrong:** Files written to unexpected location or permission denied.
**Why it happens:** cwd expects absolute path, relative path resolved unexpectedly.
**How to avoid:** Always use absolute path for cwd (NOTES_DIR already validated as absolute in config).
**Warning signs:** Note files not appearing in expected vault location.

## Code Examples

Verified patterns from official sources:

### Text Message Handler Registration
```typescript
// Source: Grammy docs - filter queries
// src/bot/bot.ts
import { handleTextMessage } from './handlers/message.js';

// In createBot():
bot.on('message:text', handleTextMessage);
```

### Note Metadata Schema
```typescript
// Source: Zod docs, Claude Agent SDK structured output docs
// src/services/note-capture.ts
import { z } from 'zod';

export const NoteMetadataSchema = z.object({
  title: z.string()
    .min(1)
    .max(100)
    .describe('A concise, descriptive title for the note (1-100 chars)'),
  tags: z.array(z.string())
    .min(3)
    .max(5)
    .describe('3-5 relevant tags as lowercase kebab-case (e.g., "project-ideas", "meeting-notes")')
});

export type NoteMetadata = z.infer<typeof NoteMetadataSchema>;
```

### YAML Frontmatter Generation
```typescript
// Source: Obsidian/YAML frontmatter conventions
function generateNoteContent(metadata: NoteMetadata, originalMessage: string): string {
  const created = new Date().toISOString();
  const tagsYaml = metadata.tags.map(tag => `  - ${tag}`).join('\n');

  return `---
title: ${metadata.title}
created: ${created}
tags:
${tagsYaml}
---

${originalMessage}
`;
}
```

### Filename Sanitization with Fallback
```typescript
// Source: sanitize-filename npm docs
import sanitize from 'sanitize-filename';

function generateFilename(title: string): string {
  const sanitized = sanitize(title, { replacement: '-' });
  if (!sanitized) {
    // Fallback for edge cases like ".." -> ""
    return `note-${Date.now()}.md`;
  }
  return `${sanitized}.md`;
}
```

### Complete Capture Service
```typescript
// Source: Claude Agent SDK docs - query function, structured output
import { query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import sanitize from 'sanitize-filename';
import { config } from '../config.js';

const NoteMetadataSchema = z.object({
  title: z.string().min(1).max(100),
  tags: z.array(z.string()).min(3).max(5)
});

type NoteMetadata = z.infer<typeof NoteMetadataSchema>;

export async function captureNote(message: string): Promise<{ title: string }> {
  // Phase 1: Extract metadata
  const metadata = await extractMetadata(message);

  // Phase 2: Write file
  const filename = sanitize(metadata.title, { replacement: '-' }) || `note-${Date.now()}`;
  const content = generateNoteContent(metadata, message);

  await writeNoteFile(filename + '.md', content);

  return { title: metadata.title };
}

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
      outputFormat: { type: 'json_schema', schema }
    }
  })) {
    if (msg.type === 'result') {
      if (msg.subtype === 'success' && msg.structured_output) {
        const parsed = NoteMetadataSchema.safeParse(msg.structured_output);
        if (parsed.success) return parsed.data;
      }
      throw new Error(`Metadata extraction failed: ${msg.subtype}`);
    }
  }
  throw new Error('No result from metadata extraction');
}

async function writeNoteFile(filename: string, content: string): Promise<void> {
  // Built-in tools to block (keep only Write)
  const disallowed = [
    'Bash', 'Read', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch',
    'Task', 'NotebookEdit', 'TodoWrite', 'BashOutput', 'KillShell', 'SlashCommand'
  ];

  for await (const msg of query({
    prompt: `Write the following content to the file "${filename}":

${content}`,
    options: {
      cwd: config.NOTES_DIR,
      disallowedTools: disallowed,
      permissionMode: 'acceptEdits',
      maxTurns: 3
    }
  })) {
    if (msg.type === 'result') {
      if (msg.subtype !== 'success') {
        throw new Error(`File write failed: ${msg.subtype}`);
      }
      return;
    }
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Claude Code SDK | Claude Agent SDK | Dec 2025 | Package renamed, migration guide available |
| `allowedTools` for restriction | `disallowedTools` for restriction | SDK v0.2.x | `allowedTools` is permissioning only |
| zod-to-json-schema (external) | `z.toJSONSchema()` (built-in) | Zod v4.0 | No external dependency needed |

**Deprecated/outdated:**
- `@anthropic-ai/claude-code-sdk`: Renamed to `@anthropic-ai/claude-agent-sdk`
- `allowedTools` for tool restriction: Use `disallowedTools` instead (documented in GitHub issue #19)

## Open Questions

Things that couldn't be fully resolved:

1. **Optimal prompt for title/tag extraction**
   - What we know: Structured output works, prompt should be clear about format
   - What's unclear: Exact prompt wording for best title quality
   - Recommendation: Start with simple prompt, iterate based on output quality

2. **Error handling for rate limits**
   - What we know: SDK may throw on rate limits
   - What's unclear: Exact error types and retry behavior
   - Recommendation: Wrap in try/catch, add retry logic if needed

3. **Cost tracking**
   - What we know: Result message includes `total_cost_usd`
   - What's unclear: Whether to surface this to user or just log
   - Recommendation: Log for monitoring, don't show to user initially

## Sources

### Primary (HIGH confidence)
- [Claude Agent SDK TypeScript v0.2.30](https://github.com/anthropics/claude-agent-sdk-typescript) - GitHub repository
- [Claude Agent SDK Structured Outputs](https://platform.claude.com/docs/en/agent-sdk/structured-outputs) - Official docs
- [Zod v4 JSON Schema](https://zod.dev/json-schema) - Built-in `z.toJSONSchema()` API
- [Grammy Filter Queries](https://grammy.dev/guide/filter-queries) - `message:text` filter syntax

### Secondary (MEDIUM confidence)
- [Complete Guide to Claude Agent SDK](https://nader.substack.com/p/the-complete-guide-to-building-agents) - Tutorial verified against official docs
- [sanitize-filename](https://github.com/parshap/node-sanitize-filename) - GitHub README
- [Promptfoo Claude Agent SDK docs](https://www.promptfoo.dev/docs/providers/claude-agent-sdk/) - Configuration reference

### Tertiary (LOW confidence)
- [allowedTools Issue #19](https://github.com/anthropics/claude-agent-sdk-typescript/issues/19) - Workaround for tool restriction

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official SDK docs and npm verified
- Architecture: HIGH - Patterns from official docs and project conventions
- Pitfalls: MEDIUM - GitHub issues + testing needed for edge cases

**Research date:** 2026-02-03
**Valid until:** 2026-03-03 (30 days - SDK is stable but evolving)
