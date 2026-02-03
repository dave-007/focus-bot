# Focus Bot

## What This Is

A focused Telegram bot that captures quick thoughts and saves them to an Obsidian vault. Any message sent to the bot becomes a note — Claude analyzes the content, generates a title and 3-5 relevant tags, and writes the markdown file directly to the vault.

## Core Value

**One thing done well:** Message → Note. No friction, no decisions. Just send a thought and it's captured with intelligent metadata.

## How It Works

1. User sends a message to the Telegram bot
2. Claude Agent SDK receives the message
3. Claude analyzes content, extracts a title, generates 3-5 flat tags
4. Claude writes a markdown file to the Obsidian vault via Write tool
5. Bot confirms: "Saved: [Note Title]"

## Technical Approach

**Stack:**
- Grammy + @grammyjs/runner — Telegram bot framework
- @anthropic-ai/claude-agent-sdk — Claude Code API for analysis + file writing
- Zod — Config validation
- TypeScript

**Architecture:**
- Single working directory: the Obsidian vault (configured via `NOTES_DIR`)
- Claude has access to Write tool only (no Bash, no Read needed)
- No streaming UI needed — just confirmation message

**Note Format:**
```markdown
---
title: Generated Title
created: 2026-02-02T15:30:00Z
tags:
  - tag-one
  - tag-two
  - tag-three
---

Original message content here.
```

**Filename:** Slugified title (e.g., `generated-title.md`)

## Commands

- `/start` — Help message explaining how to use the bot
- `/recent` — List last few notes saved

## Constraints

- Single user or small whitelist (personal tool)
- Notes directory must exist and be writable
- Flat directory structure (no subfolders)
- Flat tags (no hierarchy like `#project/foo`)
- 3-5 tags per note

## What This Is NOT

- Not a general-purpose Claude Code bot (that's Claudegram)
- Not a note search/retrieval system (that's Obsidian's job)
- Not a multi-vault manager
- Not handling images, voice, or attachments (text only for v1)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude Agent SDK over direct API | User preference; allows Claude to write files directly | Pending |
| Write tool only | Minimal permissions; bot only needs to create files | Pending |
| Flat tags | Simplicity; no existing convention to follow | Pending |
| Slugified filenames | Clean URLs, filesystem-safe, readable | Pending |

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Telegram bot receives messages and routes to Claude
- [ ] Claude analyzes message content and generates title
- [ ] Claude generates 3-5 relevant tags based on subject matter
- [ ] Claude writes markdown file with frontmatter to vault
- [ ] Bot confirms note was saved with title
- [ ] `/start` command shows help
- [ ] `/recent` command lists last few notes
- [ ] Auth middleware restricts to allowed user IDs
- [ ] Config validated via Zod (TELEGRAM_BOT_TOKEN, NOTES_DIR, ALLOWED_USER_IDS)

### Out of Scope

- Voice/image handling — text only for v1
- Note search — use Obsidian
- Note editing/deletion — use Obsidian
- Subfolders/organization — flat directory
- Tag hierarchy — flat tags only
- Multi-user/multi-vault — personal tool

---
*Last updated: 2026-02-02 after initialization*
