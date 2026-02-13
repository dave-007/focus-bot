# Focus Bot

![Focus Bot](public/focus-bot-hero.png)

A Telegram bot that captures thoughts and bookmarks as Obsidian markdown notes. Send a message, get an AI-organized note with a title, type-based tags, and inline `[[wiki-links]]`. Share a link, get an AI summary published to [Telegraph](https://telegra.ph) for instant reading.

## Organization Philosophy

Focus Bot takes a **bottom-up** approach to knowledge organization. Instead of requiring you to decide where something goes before you capture it, you just send a thought and the structure emerges naturally over time.

**Tags classify *what* something is.** They describe the type of capture — `ideas`, `quotes`, `articles`, `books`, `recipes` — not what it's about. Tags answer "what kind of thing is this?" and help you filter your vault by format or content type.

**Wiki-links classify *what* something is about.** Inline `[[wiki-links]]` are woven into the note body around key concepts, proper names, and ideas worth exploring. They create organic connections between notes without any upfront taxonomy. Over time, frequently linked concepts naturally become hubs in your knowledge graph.

This is intentionally the opposite of top-down systems that force you to pick a folder or category first. There's no hierarchy to maintain, no folders to organize into, no categories to predefine. Just tags for *type* and wiki-links for *meaning* — and the graph takes care of the rest.

## How It Works

**Text messages** are analyzed by Claude to generate metadata, then saved as markdown files to your Obsidian vault root:

```
You: "I've been thinking about how trees communicate through mycelium networks underground"
Bot: 👍
```

Creates `Mycelium Communication Networks.md`:

```markdown
---
captured: 2026-02-06T14:34
source: telegram
status: inbox
tags:
  - captures
  - ideas
---
I've been thinking about how [[trees]] communicate through [[mycelium]] networks underground
```

- **Filename** is the AI-generated title (Obsidian convention — no title in frontmatter)
- **Tags** describe the type of capture (`captures` is always included automatically)
- **Wiki-links** connect the note to concepts in your vault

**URLs** (YouTube videos, articles, blog posts) are saved to a `Bookmarks/` subdirectory with AI-generated summaries published to Telegraph:

```
You: https://www.youtube.com/watch?v=example
Bot: 👍
Bot: https://telegra.ph/Video-Title-02-06    (reply with readable summary)
Bot: 💯                                      (replaces 👍 when enrichment completes)
```

Creates `Bookmarks/Video Title.md` with frontmatter, the original URL, an AI summary in an Obsidian callout, and a `telegraph:` link in the frontmatter.

## Features

- **Instant capture** — Send a thought, get a note. No friction.
- **AI metadata** — Claude generates titles, type-based tags, and inline `[[wiki-links]]`
- **Voice notes** — Dictate notes via voice messages with Groq Whisper transcription and multi-turn editing
- **URL enrichment** — YouTube transcripts and article text summarized by AI
- **Telegraph publishing** — Readable summaries via Telegram's Instant View
- **Bookmarks** — URL notes saved separately in `Bookmarks/` directory
- **Custom prompts** — Override any AI prompt by editing Markdown files in your vault
- **Debug logging** — Full transcript and LLM exchange logging for prompt iteration
- **Access control** — User whitelist restricts who can use the bot

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI (`claude` in PATH)
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- Obsidian vault directory
- For YouTube transcripts: [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed
- For voice transcription: [Groq](https://groq.com/) API key

## Setup

```bash
git clone <repo-url>
cd focus-bot
bun install
cp .env.example .env
# Edit .env with your values
```

### Configuration

Edit `.env` with your values:

- **`TELEGRAM_BOT_TOKEN`** (required) — Bot token from [@BotFather](https://t.me/BotFather)
- **`ALLOWED_USER_IDS`** (required) — Comma-separated Telegram user IDs
- **`NOTES_DIR`** (required) — Absolute path to your Obsidian vault root
- **`ANTHROPIC_API_KEY`** (optional) — Anthropic API key (uses Claude subscription if not set)
- **`CAPTURE_MODEL`** (optional) — Claude model for capture (default: `haiku`)
- **`ENRICHMENT_MODEL`** (optional) — Claude model for summaries (default: `haiku`)
- **`GROQ_API_KEY`** (required) — Groq API key for voice transcription (Whisper)
- **`PROMPTS_DIR`** (optional) — Subdirectory name for custom prompts (e.g., `Prompts`). When set, prompt files are seeded in `NOTES_DIR/<value>/Focus Bot/` and read on every request. Omit to use built-in defaults.
- **`TRANSCRIPT_LOG`** (optional) — Path to debug log file (default: `/tmp/focus-bot-transcripts.log`)
- **`CLAUDE_CODE_PATH`** (optional) — Path to `claude` CLI (default: resolved via PATH)

To find your Telegram user ID, message [@userinfobot](https://t.me/userinfobot).

### Vault Structure

The bot expects and creates this structure:

```
your-vault/
  Bookmarks/                    # Auto-created — URL-based notes go here
    Article Title.md
    Video Title.md
  Prompts/                      # Created when PROMPTS_DIR=Prompts is set
    Focus Bot/
      note-capture.md           # Prompt for text note metadata extraction
      voice-assistant.md        # System prompt for voice drafting
      video-summary.md          # Prompt for YouTube video summaries
      article-summary.md        # Prompt for article summaries
  Note Title.md                 # Text notes go in vault root
  Another Note.md
```

## Usage

### Running

```bash
# Development (hot reload)
bun run dev

# Production
bun run start
```

### Telegram Commands

- `/start` — Show help message
- `/health` — Check bot health and uptime
- `/status` — Show systemd service status
- `/logs` — Show recent log entries
- `/restart` — Restart the bot service

### Message Types

- **Text message** — Saved as note in vault root with AI metadata
- **Voice message** — Transcribed via Groq Whisper, then processed as a draft note with multi-turn editing (send follow-up voice or text messages to refine, react with 👍 to save)
- **URL** — Saved to `Bookmarks/`, summary published to Telegraph
- **YouTube link** — Transcript fetched, summarized, published to Telegraph

### Custom Prompts

Set `PROMPTS_DIR=Prompts` in `.env` to enable user-configurable prompts. On startup, the bot seeds default prompt files as Markdown in your vault at `Prompts/Focus Bot/`. Edit any file to customize the AI behavior — changes take effect on the next message with no restart required.

Available prompts:

| File | Used for |
|------|----------|
| `note-capture.md` | Text note metadata extraction (title, tags, body) |
| `voice-assistant.md` | Voice note drafting system prompt |
| `video-summary.md` | YouTube video transcript summaries |
| `article-summary.md` | Article/URL summaries |

Prompts use `{{variable}}` placeholders (e.g., `{{message}}`, `{{transcript}}`) that are substituted at call time. See the seeded files for the full template syntax.

### Debug Logging

All voice transcriptions and LLM prompt/response exchanges are logged to a plain text file for debugging and prompt iteration:

```bash
# View live log
tail -f /tmp/focus-bot-transcripts.log
```

Set `TRANSCRIPT_LOG` in `.env` to change the log path. Each entry includes a timestamp, the full prompt sent to Claude, and the response received.

## Production Deployment

### systemd (Linux)

A template service file is included at `focus-bot.service`. Replace the placeholders before installing:

- `%USER%` — Your system username
- `%WORKING_DIR%` — Absolute path to the focus-bot directory
- `%BUN_PATH%` — Absolute path to the `bun` binary (run `which bun`)

```bash
# Edit the service file with your values
vim focus-bot.service

# Install and start
sudo cp focus-bot.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now focus-bot

# View logs
journalctl -u focus-bot -f
```

### Other Platforms

The bot is a standard Bun/Node.js process. Use any process manager:

```bash
# PM2
pm2 start "bun run start" --name focus-bot

# Docker (bring your own Dockerfile)
# launchd (macOS)
# etc.
```

## Architecture

```
Telegram → Grammy Bot → Auth Middleware → Message Handler
  ↓                                          ↓
  ↓                          captureNote() → Claude haiku → fs.writeFileSync
  ↓                                          ↓
  ↓                                        👍 reaction
  ↓                                          ↓
  ↓                          processNote() → AI summary → Telegraph → reply with link → 💯
```

1. [Grammy](https://grammy.dev/) receives updates via long polling
2. Auth middleware checks user ID against whitelist
3. `captureNote()` extracts metadata (title, tags, body) via Claude, writes `.md` file (fast path)
4. `processNote()` runs async: fetches content, generates AI summary, publishes to Telegraph
5. User gets 👍 immediately, then a Telegraph link reply, then 💯 when done

All AI prompts are centralized in the prompts service (`src/services/prompts.ts`). When `PROMPTS_DIR` is configured, prompts are read from user-editable Markdown files in the vault at runtime, allowing real-time customization without restarting the bot.

## Note Format

### Text Notes

Saved to vault root:

```markdown
---
captured: 2026-02-06T14:34
source: telegram
status: inbox
tags:
  - captures
  - ideas
---
I've been thinking about how [[trees]] communicate through [[mycelium]] networks underground
```

### URL Notes (Bookmarks)

Saved to `Bookmarks/`:

```markdown
---
captured: 2026-02-06T14:34
source: telegram
status: inbox
url: "https://example.com/article"
telegraph: "https://telegra.ph/Article-Title-02-06"
tags:
  - captures
  - articles
  - links
---
Check out this article on [[machine learning]] https://example.com/article

> **Article Title**
> A look at recent advances in neural network architectures.
> — example.com

> [!summary] Summary
> This article explores recent advances in machine learning...
> - Key point one
> - Key point two
```

### Tag Examples

Tags describe what *type* of capture a note is — always plural, never topical:

- `captures` — Always included (code-enforced)
- `ideas` — Original thoughts, speculations
- `quotes` — Attributed quotes, passages
- `articles` — Links to articles, blog posts
- `links` — Generic bookmarks
- `books` — Book references, reading notes
- `recipes`, `poems`, `songs`, `tools`, `movies` — Other content types

Subject matter connections are handled entirely by `[[wiki-links]]` in the note body.

## Tech Stack

- [Bun](https://bun.sh/) — Runtime (runs TypeScript directly, no build step)
- [Grammy](https://grammy.dev/) — Telegram bot framework
- [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) — AI metadata extraction and summarization
- [Zod](https://zod.dev/) — Config validation and response parsing
- [telegra.ph](https://www.npmjs.com/package/telegra.ph) — Telegraph page publishing
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — YouTube transcript fetching
- [Groq](https://groq.com/) — Voice transcription (Whisper large-v3-turbo)

## License

MIT
