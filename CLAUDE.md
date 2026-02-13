# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Focus Bot is a Telegram bot that captures quick thoughts and saves them as markdown notes to an Obsidian vault. Messages sent to the bot are analyzed by Claude to generate a title, tags, and inline wiki-links, then written as markdown files with YAML frontmatter to the vault root. Voice messages are transcribed via Groq Whisper and processed through a multi-turn drafting flow before saving. Tags describe the **type** of capture (always plural: `captures`, `quotes`, `ideas`, `articles`), while `[[wiki-links]]` in the note body handle subject matter connections.

## Development Workflow

This repo follows TDD. All tests must pass before committing code. Run `bun test` and fix any failures before creating commits.

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

### Text Message Flow
```
Telegram → Grammy Bot → Auth Middleware → Message Handler → Note Capture Service → fs.writeFileSync → NOTES_DIR/ or Bookmarks/
                                                         → (async) Note Enrichment Service → Telegraph → Reply with link
```

1. Grammy receives Telegram update via long polling (`@grammyjs/runner`)
2. Auth middleware checks user ID against `ALLOWED_USER_IDS` whitelist
3. Message handler extracts text and calls `captureNote()` (fast path)
   - If user has an active voice session, text is routed to the voice drafting flow instead
4. Note capture service:
   - **Metadata extraction**: Claude haiku analyzes message, returns JSON `{title, tags, body}`
   - Tags are type-based (what kind of capture), not topical. `captures` tag is code-enforced.
   - Body includes inline `[[wiki-links]]` for key concepts
   - **File writing**: Direct `fs.writeFileSync` to `NOTES_DIR` (text notes) or `Bookmarks/` (URL notes)
5. Handler replies to user with 👍 reaction
6. Handler fires `processNote()` as fire-and-forget (async enrichment for URLs)

### Voice Message Flow
```
Telegram Voice → Download OGG → Groq Whisper → Transcription → Voice AI (Claude) → Draft Message
                                                              → Follow-up voice/text → Edit draft in-place
                                                              → 👍 reaction or "save" → fs.writeFileSync → NOTES_DIR/
```

1. Voice handler downloads OGG Opus file from Telegram servers
2. Audio sent to Groq Whisper API (`whisper-large-v3-turbo`) for transcription
3. Transcribed text processed by Claude to generate `{action, title, tags, body}` JSON
4. **Draft action**: Bot sends/edits a formatted preview message (bold title, italic tags, body)
5. **Multi-turn editing**: Follow-up voice or text messages refine the draft in-place (conversation history preserved)
6. **Save action**: Note written to vault with `source: telegram-voice`, draft message updated with ✅ prefix
7. **Cancel action**: Draft discarded, message updated to "Draft discarded"
8. **Reaction save**: 👍 on draft message triggers save (via `message_reaction` update)

Sessions are in-memory (one per user, lost on restart).

### Key Files
- `src/index.ts` - Entry point, bot startup, graceful shutdown
- `src/config.ts` - Zod-validated environment configuration + `BOOKMARKS_DIR`
- `src/bot/bot.ts` - Grammy bot initialization, middleware/handler registration
- `src/bot/middleware/auth.ts` - User whitelist enforcement
- `src/bot/handlers/message.ts` - Routes text messages to note capture (or voice session if active), fires async enrichment
- `src/bot/handlers/voice.ts` - Voice message handler, draft formatting, save/cancel logic, reaction-based save
- `src/services/note-capture.ts` - Core logic: metadata extraction (title, tags, body) + direct file writing
- `src/services/note-enrichment.ts` - Async URL enrichment: AI summaries, Telegraph publishing, frontmatter updates
- `src/services/voice-ai.ts` - Claude integration for voice draft generation (system prompt, Zod validation, multi-turn context)
- `src/services/voice-session.ts` - In-memory session store (per-user draft state, conversation history)
- `src/services/voice-transcription.ts` - Telegram file download + Groq Whisper API transcription
- `src/utils/telegraph.ts` - Telegraph (telegra.ph) client: account management, content conversion, page creation

### Claude Agent SDK Usage Pattern

The bot uses `query()` from `@anthropic-ai/claude-agent-sdk` for a single call:

**Metadata extraction** (`haiku` model, 1 turn):
- Asks for JSON with title, tags (type-based, plural), and wiki-linked body
- `captures` tag is code-enforced (always prepended, not in AI response)
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
- **Voice notes**: Written to `NOTES_DIR/` root (same as text, with `source: telegram-voice`)
- **URL notes** (bookmarks, links): Written to `NOTES_DIR/Bookmarks/` (auto-created at startup)

## Configuration

Required environment variables (validated at startup):

- **`TELEGRAM_BOT_TOKEN`** — Bot token from @BotFather
- **`ALLOWED_USER_IDS`** — Comma-separated Telegram user IDs
- **`NOTES_DIR`** — Absolute path to Obsidian vault root
- **`ANTHROPIC_API_KEY`** — Optional (defaults to subscription model)
- **`GROQ_API_KEY`** — Required for voice transcription (Whisper)

Derived values:
- **`BOOKMARKS_DIR`** — `NOTES_DIR/Bookmarks/` (auto-created at startup)

## Note Format

The filename IS the title (Obsidian convention). No `title` property in frontmatter. Inspired by [Steph Ango's vault](https://stephango.com/vault).

```markdown
---
captured: 2026-02-04T14:34
source: telegram
status: inbox
tags:
  - captures
  - ideas
---
One way to prove or overcome the subjectiveness of [[consciousness]] or [[qualia]], would be to have some sort of consciousness sharing experience.
```

- **Filename**: AI-generated title with spaces preserved (e.g., `Consciousness Sharing to Prove Qualia.md`)
- **captured**: Local datetime in `YYYY-MM-DDTHH:mm` format (Obsidian-compatible)
- **source**: `telegram` for text notes, `telegram-voice` for voice notes (enables Dataview filtering)
- **status**: Always `inbox` (for processing workflow)
- **tags**: Plain strings describing the type of capture (always plural). `captures` is code-enforced. Examples: `captures`, `quotes`, `ideas`, `articles`, `links`, `books`.
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
