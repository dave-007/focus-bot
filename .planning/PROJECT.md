# Focus Bot

## What This Is

A focused Telegram bot that captures quick thoughts and saves them as markdown notes to an Obsidian vault. Messages are analyzed by Claude to generate a title, type-based tags, and inline `[[wiki-links]]`, then written as markdown files with YAML frontmatter to the vault root. Tags describe the type of capture (always plural), while wiki-links handle subject matter connections.

## Core Value

**One thing done well:** Message -> Note. No friction, no decisions. Just send a thought and it's captured with intelligent metadata.

**Architectural principle:** Capture and organization are separate activities. Focus Bot optimizes ruthlessly for capture speed and reliability. Organization, linking, and enrichment happen asynchronously.

## How It Works

**Text messages:**
1. User sends a text message to the Telegram bot
2. Grammy receives the update, auth middleware checks user whitelist
3. Claude (haiku) analyzes content, returns JSON with title, tags, and wiki-linked body
4. Bot writes markdown file directly to NOTES_DIR via `fs.writeFileSync`
5. Bot confirms with 👍 reaction
6. Async enrichment fires for URLs (AI summary → Telegraph → reply with link → 💯)

**Voice messages:**
1. User sends a voice message to the bot
2. Audio downloaded from Telegram, transcribed via Groq Whisper (large-v3-turbo)
3. Claude processes transcription into a draft (title, tags, wiki-linked body)
4. Bot sends formatted draft preview (bold title, italic tags)
5. User refines with follow-up voice/text messages (multi-turn editing)
6. User saves (👍 reaction or "save" command) or cancels

## Technical Approach

**Stack:**
- Grammy + @grammyjs/runner -- Telegram bot framework with concurrent long polling
- @anthropic-ai/claude-agent-sdk -- Claude haiku for metadata extraction (JSON response)
- Zod -- Config and metadata validation
- TypeScript + Bun runtime (no build step, runs TS directly)
- sanitize-filename -- Safe filename generation

**Architecture:**
- Single Claude call extracts title, tags (type-based, plural), and rewrites body with `[[wiki-links]]`
- `captures` tag code-enforced (always prepended)
- Notes written to vault root (NOTES_DIR)
- Fire-and-forget enrichment path after user gets confirmation
- systemd service for production deployment with auto-restart
- Bot sends startup notification to all allowed users on boot

**Note Format:**
```markdown
---
captured: 2026-02-06T14:34
source: telegram
status: inbox
tags:
  - captures
  - ideas
---
One way to prove or overcome the subjectiveness of [[consciousness]] or [[qualia]], would be to have some sort of consciousness sharing experience.
```

- **Filename**: AI-generated title with spaces preserved (e.g., `Consciousness Sharing to Prove Qualia.md`)
- The filename IS the title (Obsidian convention) -- no `title` in frontmatter
- **captured**: Local datetime `YYYY-MM-DDTHH:mm` (Obsidian-compatible)
- **tags**: Plain strings describing the type of capture (always plural). `captures` is code-enforced. Examples: `quotes`, `ideas`, `articles`, `links`, `books`.
- **source**: Always `telegram` (enables Dataview filtering)
- **status**: Always `inbox` (for processing workflow)
- **Body**: Original message with inline `[[wiki-links]]` for key concepts

## Commands

- `/start` -- Help message explaining how to use the bot (also sent on startup)
- `/health` -- Check bot health and uptime
- `/status` -- Show systemd service status
- `/logs` -- Show recent log entries
- `/restart` -- Restart the bot service

## Constraints

- Single user or small whitelist (personal tool)
- Notes directory must exist and be writable
- Notes go to vault root (NOTES_DIR)
- 1-8 tags per note (type-based, plural, `captures` always included)

## What This Is NOT

- Not a general-purpose Claude Code bot (that's Claudegram)
- Not a note search/retrieval system (that's Obsidian's job)
- Not a multi-vault manager
- Not handling images, voice, or attachments (text only for now)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Claude Agent SDK for metadata only | Reliable JSON extraction; file writing done directly via fs | Validated |
| Direct fs.writeFileSync over Claude Write tool | More reliable, faster, no tool permission issues | Validated |
| Tags replace categories+topics | Type-based tags (plural) for what kind of capture; wiki-links for subject matter | Validated |
| captures tag code-enforced | Every telegram capture gets this tag for easy filtering | Validated |
| Notes in vault root | No Captures/ subdirectory -- categories and topics handle organization | Validated |
| Inline wiki-links in body | Claude rewrites body with [[links]] in same call -- zero extra latency | Validated |
| `captures` always included | Every telegram capture gets this tag for easy filtering | Validated |
| Spaces in filenames | Obsidian convention -- filename IS the title | Validated |
| No title in frontmatter | Obsidian uses filename as title; avoids duplication | Validated |
| Local datetime format | `YYYY-MM-DDTHH:mm` matches Obsidian DateTime property type | Validated |
| source/status fields | Enables Dataview queries and inbox processing workflow | Validated |
| Fire-and-forget enrichment | Never blocks the user; enrichment failures are logged only | Validated |
| Zod for config + metadata | Consistent validation pattern throughout the app | Validated |
| Bun runtime, no build step | Fast startup, runs TypeScript directly, no dist/ needed | Validated |
| systemd for production | Auto-restart on failure, starts on boot, journal logging | Validated |
| Startup notification | Bot sends /start message to all allowed users on boot | Validated |

## Requirements

### Validated

- [x] CFG-01: Config validated via Zod (TELEGRAM_BOT_TOKEN, NOTES_DIR, ALLOWED_USER_IDS)
- [x] CFG-02: Bot fails fast with clear error on invalid config
- [x] CFG-03: ANTHROPIC_API_KEY optional (defaults to subscription)
- ~~CFG-04: Categories/ directory loaded at startup~~ — Removed (replaced by tags)
- [x] AUTH-01: Auth middleware restricts to allowed user IDs
- [x] AUTH-02: Unauthorized users receive "not authorized" message
- [x] CMD-01: `/start` command shows help
- [x] CMD-03: `/restart` in Telegram menu, startup notification on boot
- [x] NOTE-01: Telegram bot receives text messages
- [x] NOTE-02: Claude analyzes message content and generates title
- [x] NOTE-03: Claude assigns type-based tags (plural, freeform)
- ~~NOTE-04: Claude generates 2-5 topics as wiki-links~~ — Removed (replaced by tags)
- [x] NOTE-05: Claude adds inline [[wiki-links]] to note body
- [x] NOTE-06: Bot writes markdown file with frontmatter to vault root
- [x] NOTE-07: Bot confirms note was saved with title
- [x] ADMIN-01: `/health`, `/status`, `/logs`, `/restart` admin commands

### Dropped

- ~~CMD-02: `/recent` command~~ -- Telegram history serves this function

### Future

- [ ] URL/bookmark capture with metadata fetching (auto-detect URLs, add to frontmatter, async fetch page metadata)
- [ ] Voice note support
- [ ] Emoji reaction acknowledgment for faster perceived latency
- [ ] Review/processing commands (`/inbox`, `/review`)

### Out of Scope

- Voice/image handling -- text only for now
- Note search -- use Obsidian
- Note editing/deletion -- use Obsidian
- Multi-user/multi-vault -- personal tool

## Research

Research conducted 2026-02-05 covering:
- Obsidian properties best practices and YAML formatting
- Second brain methodologies (BASB/PARA, Zettelkasten, GTD, Evergreen Notes, MOCs)
- AI-assisted note-taking trends 2025-2026
- Competitive landscape (Telegram Sync plugin, Mem.ai, tg2obsidian)

Research conducted 2026-02-06 covering:
- Steph Ango's vault system (stephango.com/vault, kepano/kepano-obsidian repo)
- Categories as wiki-links to hub notes (Obsidian Bases feature)
- Tags vs categories vs topics distinction
- Wiki-links in YAML frontmatter (quoted syntax, Dataview compatibility)
- Obsidian property types and frontmatter link behavior

Key findings documented in:
- `.planning/research/IMPROVEMENT-OPTIONS-REPORT.md` -- Feature prioritization and recommendations
- `.planning/research/SECOND-BRAIN-METHODOLOGIES.md` -- Deep methodology research

---
*Last updated: 2026-02-06 after Steph Ango vault restructure*
