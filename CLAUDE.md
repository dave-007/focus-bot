# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Focus Bot is a Telegram bot that captures quick thoughts and saves them as markdown notes to an Obsidian vault. Messages sent to the bot are analyzed by Claude to generate a title, categories, topics, and inline wiki-links, then written as markdown files with YAML frontmatter to the vault root. Organization follows Steph Ango's vault patterns: categories as wiki-links to hub notes, topics for subject matter, and `[[wiki-links]]` in note body.

## Commands

```bash
# Development (with hot reload)
bun run dev

# Production build
bun run build

# Run built output
bun run start

# Type check without emitting
npx tsc --noEmit
```

## Architecture

### Message Flow
```
Telegram → Grammy Bot → Auth Middleware → Message Handler → Note Capture Service → fs.writeFileSync → NOTES_DIR/ or Bookmarks/
                                                         → (async) Note Enrichment Service → Telegraph → Reply with link
```

1. Grammy receives Telegram update via long polling (`@grammyjs/runner`)
2. Auth middleware checks user ID against `ALLOWED_USER_IDS` whitelist
3. Message handler extracts text and calls `captureNote()` (fast path)
4. Note capture service:
   - **Metadata extraction**: Claude haiku analyzes message, returns JSON `{title, categories, topics, body}`
   - Categories are constrained to files in `NOTES_DIR/Categories/` (loaded at startup)
   - Body includes inline `[[wiki-links]]` for key concepts
   - **File writing**: Direct `fs.writeFileSync` to `NOTES_DIR` (text notes) or `Bookmarks/` (URL notes)
5. Handler replies to user with 👍 reaction
6. Handler fires `processNote()` as fire-and-forget (async enrichment for URLs)

### Key Files
- `src/index.ts` - Entry point, bot startup, categories loading, graceful shutdown
- `src/config.ts` - Zod-validated environment configuration + `CATEGORIES_DIR` + `BOOKMARKS_DIR` + `loadCategories()`
- `src/bot/bot.ts` - Grammy bot initialization, middleware/handler registration
- `src/bot/middleware/auth.ts` - User whitelist enforcement
- `src/bot/handlers/message.ts` - Routes text messages to note capture, fires async enrichment
- `src/services/note-capture.ts` - Core logic: metadata extraction + direct file writing
- `src/services/note-enrichment.ts` - Async URL enrichment: AI summaries, Telegraph publishing, frontmatter updates
- `src/utils/telegraph.ts` - Telegraph (telegra.ph) client: account management, content conversion, page creation

### Claude Agent SDK Usage Pattern

The bot uses `query()` from `@anthropic-ai/claude-agent-sdk` for a single call:

**Metadata extraction** (`haiku` model, 1 turn):
- Prompt includes the category list from `Categories/` directory
- Asks for JSON with title, categories, topics, and wiki-linked body
- Response parsed with regex to extract JSON, validated with Zod
- No tools allowed (pure text response)

File writing is done directly via `fs.writeFileSync` — no Claude SDK involved.

### Async Enrichment Architecture

After the fast capture path completes and the user gets their 👍 reaction, the message handler fires `processNote()` as a fire-and-forget call:

1. **YouTube URLs**: Fetches transcript via `yt-dlp`, generates AI summary via Claude haiku
2. **Generic URLs**: Fetches article text, generates AI summary via Claude haiku
3. **Telegraph publishing**: Summary is published to telegra.ph for a readable Instant View link
4. **Frontmatter update**: Telegraph URL stored in note's `telegraph:` field
5. **Reply**: Telegraph link sent as a reply to the user's original message
6. **Reaction**: 💯 replaces the 👍 when enrichment completes

Telegraph account credentials are persisted in `.telegraph-account.json` (auto-created on first use).

Enrichment failures are logged but never surface to the user.

### Note Routing

- **Text notes** (no URLs): Written to `NOTES_DIR/` root
- **URL notes** (bookmarks, links): Written to `NOTES_DIR/Bookmarks/` (auto-created at startup)

## Configuration

Required environment variables (validated at startup):

- **`TELEGRAM_BOT_TOKEN`** — Bot token from @BotFather
- **`ALLOWED_USER_IDS`** — Comma-separated Telegram user IDs
- **`NOTES_DIR`** — Absolute path to Obsidian vault root (must contain a `Categories/` subdirectory)
- **`ANTHROPIC_API_KEY`** — Optional (defaults to subscription model)

Derived values:
- **`CATEGORIES_DIR`** — `NOTES_DIR/Categories/` (must exist, read at startup)
- **`BOOKMARKS_DIR`** — `NOTES_DIR/Bookmarks/` (auto-created at startup)

## Note Format

The filename IS the title (Obsidian convention). No `title` property in frontmatter. Inspired by [Steph Ango's vault](https://stephango.com/vault).

```markdown
---
captured: 2026-02-04T14:34
source: telegram
status: inbox
categories:
  - "[[Captures]]"
  - "[[Ideas]]"
topics:
  - "[[Consciousness]]"
  - "[[Philosophy]]"
---
One way to prove or overcome the subjectiveness of [[consciousness]] or [[qualia]], would be to have some sort of consciousness sharing experience.
```

- **Filename**: AI-generated title with spaces preserved (e.g., `Consciousness Sharing to Prove Qualia.md`)
- **captured**: Local datetime in `YYYY-MM-DDTHH:mm` format (Obsidian-compatible)
- **source**: Always `telegram` (enables Dataview filtering)
- **status**: Always `inbox` (for processing workflow)
- **categories**: Wiki-links to hub notes in `Categories/` directory. `[[Captures]]` always included.
- **topics**: Wiki-links for subject matter (freeform, AI-generated)
- **Body**: Original message with inline `[[wiki-links]]` for key concepts
- **telegraph**: Telegraph URL for readable summary (added async by enrichment, URL notes only)
- **Location**: `NOTES_DIR` root (text notes) or `NOTES_DIR/Bookmarks/` (URL notes)

## Planning Documentation

The `.planning/` directory contains project documentation:
- `PROJECT.md` - Vision, decisions, requirements
- `ROADMAP.md` - Phased execution plan
- `STATE.md` - Current progress tracking
- `research/` - Architecture, stack, and pitfall analysis
- `phases/` - Detailed plans for each development phase
