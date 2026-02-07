# Focus Bot

A Telegram bot that captures thoughts and bookmarks as Obsidian markdown notes. Send a message, get an AI-organized note with a title, categories, topics, and inline `[[wiki-links]]`. Share a link, get an AI summary published to [Telegraph](https://telegra.ph) for instant reading.

Organization follows [Steph Ango's vault patterns](https://stephango.com/vault).

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
categories:
  - "[[Captures]]"
  - "[[Ideas]]"
topics:
  - "[[Mycelium Networks]]"
  - "[[Plant Communication]]"
---
I've been thinking about how [[trees]] communicate through [[mycelium]] networks underground
```

**URLs** (YouTube videos, articles, blog posts) are saved to a `Bookmarks/` subdirectory with AI-generated summaries. Summaries are published to Telegraph so you can read them right from Telegram:

```
You: https://www.youtube.com/watch?v=example
Bot: 👍
Bot: https://telegra.ph/Video-Title-02-06    (reply with readable summary)
Bot: 💯                                      (replaces 👍 when enrichment completes)
```

Creates `Bookmarks/Video Title.md` with frontmatter, the original URL, an AI summary in an Obsidian callout, and a `telegraph:` link in the frontmatter.

## Features

- **Instant capture** -- Send a thought, get a note. No friction.
- **AI metadata** -- Claude generates titles, categories, topics, and inline `[[wiki-links]]`
- **URL enrichment** -- YouTube transcripts and article text summarized by AI
- **Telegraph publishing** -- Readable summaries via Telegram's Instant View
- **Vault-native** -- Categories constrained to your vault's `Categories/` hub notes
- **Bookmarks** -- URL notes saved separately in `Bookmarks/` directory
- **Access control** -- User whitelist restricts who can use the bot

## Prerequisites

- [Bun](https://bun.sh/) runtime
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI (`claude` in PATH)
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- Obsidian vault with a `Categories/` directory containing hub note `.md` files
- For YouTube transcripts: [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed

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

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from [@BotFather](https://t.me/BotFather) |
| `ALLOWED_USER_IDS` | Yes | Comma-separated Telegram user IDs |
| `NOTES_DIR` | Yes | Absolute path to your Obsidian vault root |
| `ANTHROPIC_API_KEY` | No | Anthropic API key (uses Claude subscription if not set) |
| `CAPTURE_MODEL` | No | Claude model for capture (default: `haiku`) |
| `ENRICHMENT_MODEL` | No | Claude model for summaries (default: `haiku`) |
| `CLAUDE_CODE_PATH` | No | Path to `claude` CLI (default: resolved via PATH) |

Your vault must contain a `Categories/` directory with `.md` files (e.g., `Categories/Ideas.md`, `Categories/Clippings.md`). The bot reads these at startup to constrain AI-generated categories.

To find your Telegram user ID, message [@userinfobot](https://t.me/userinfobot).

### Vault Structure

The bot expects and creates this structure:

```
your-vault/
  Categories/        # Required -- hub notes that define valid categories
    Captures.md
    Ideas.md
    Clippings.md
    References.md
    ...
  Bookmarks/         # Auto-created -- URL-based notes go here
    Article Title.md
    Video Title.md
  Note Title.md      # Text notes go in vault root
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

| Command | Description |
|---------|-------------|
| `/start` | Show help message |
| `/health` | Check bot health and uptime |
| `/status` | Show systemd service status |
| `/logs` | Show recent log entries |
| `/restart` | Restart the bot service |

### Message Types

| You send | What happens |
|----------|-------------|
| Text message | Saved as note in vault root with AI metadata |
| URL | Saved to `Bookmarks/`, summary published to Telegraph |
| YouTube link | Transcript fetched, summarized, published to Telegraph |

## Production Deployment

### systemd (Linux)

A template service file is included at `focus-bot.service`. Replace the placeholders before installing:

| Placeholder | Replace with |
|-------------|-------------|
| `%USER%` | Your system username |
| `%WORKING_DIR%` | Absolute path to the focus-bot directory |
| `%BUN_PATH%` | Absolute path to the `bun` binary (run `which bun`) |

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
3. `captureNote()` extracts metadata via Claude, writes `.md` file (fast path)
4. `processNote()` runs async: fetches content, generates AI summary, publishes to Telegraph
5. User gets 👍 immediately, then a Telegraph link reply, then 💯 when done

## Note Format

```markdown
---
captured: 2026-02-06T14:34
source: telegram
status: inbox
url: "https://example.com/article"
telegraph: "https://telegra.ph/Article-Title-02-06"
categories:
  - "[[Captures]]"
  - "[[Clippings]]"
topics:
  - "[[Machine Learning]]"
  - "[[Neural Networks]]"
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

- **Filename** is the AI-generated title (Obsidian convention)
- **`url`** and **`telegraph`** fields only present for URL notes
- **Categories** are wiki-links constrained to your `Categories/` directory
- **Topics** are freeform wiki-links for subject matter
- **Body** has inline `[[wiki-links]]` for key concepts
- **Summary** is in an Obsidian callout block (collapsible in Obsidian)

## Tech Stack

- [Bun](https://bun.sh/) -- Runtime (runs TypeScript directly, no build step)
- [Grammy](https://grammy.dev/) -- Telegram bot framework
- [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) -- AI metadata extraction and summarization
- [Zod](https://zod.dev/) -- Config validation and response parsing
- [telegra.ph](https://www.npmjs.com/package/telegra.ph) -- Telegraph page publishing
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) -- YouTube transcript fetching

## License

MIT
